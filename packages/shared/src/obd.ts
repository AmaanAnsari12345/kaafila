/**
 * OBD-II over ELM327-compatible adapters (SAE J1979 mode 01 / mode 03).
 * Transport-agnostic: the web client feeds raw adapter text, this module parses it.
 */

/** Initialisation sequence: reset, echo off, linefeeds off, spaces off, headers off, auto protocol. */
export const ELM327_INIT = ["ATZ", "ATE0", "ATL0", "ATS0", "ATH0", "ATSP0"] as const;

/**
 * BLE "serial port" profiles used by common ELM327 BLE adapters. Clones differ, so the
 * client tries each profile in order. UUIDs are 16-bit SIG-style short forms expanded
 * by the browser, plus the Nordic UART Service used by some adapters.
 */
export const OBD_BLE_PROFILES = [
  { name: "FFF0 profile", service: 0xfff0, write: 0xfff2, notify: 0xfff1 },
  { name: "FFE0 profile", service: 0xffe0, write: 0xffe1, notify: 0xffe1 },
  {
    name: "Nordic UART",
    service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    write: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    notify: "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
  }
] as const;

export type ObdMetric = "rpm" | "speedKph" | "coolantC" | "fuelPct" | "voltage" | "engineLoadPct" | "throttlePct" | "intakeAirC";

export interface PidDef {
  pid: string;
  metric: ObdMetric;
  label: string;
  unit: string;
  bytes: number;
  decode: (b: number[]) => number;
}

export const OBD_PIDS: PidDef[] = [
  { pid: "010C", metric: "rpm", label: "Engine speed", unit: "rpm", bytes: 2, decode: ([a = 0, b = 0]) => (a * 256 + b) / 4 },
  { pid: "010D", metric: "speedKph", label: "Vehicle speed", unit: "km/h", bytes: 1, decode: ([a = 0]) => a },
  { pid: "0105", metric: "coolantC", label: "Coolant temperature", unit: "°C", bytes: 1, decode: ([a = 0]) => a - 40 },
  { pid: "012F", metric: "fuelPct", label: "Fuel level", unit: "%", bytes: 1, decode: ([a = 0]) => Math.round(((100 * a) / 255) * 10) / 10 },
  { pid: "0142", metric: "voltage", label: "Control module voltage", unit: "V", bytes: 2, decode: ([a = 0, b = 0]) => (a * 256 + b) / 1000 },
  { pid: "0104", metric: "engineLoadPct", label: "Engine load", unit: "%", bytes: 1, decode: ([a = 0]) => Math.round(((100 * a) / 255) * 10) / 10 },
  { pid: "0111", metric: "throttlePct", label: "Throttle position", unit: "%", bytes: 1, decode: ([a = 0]) => Math.round(((100 * a) / 255) * 10) / 10 },
  { pid: "010F", metric: "intakeAirC", label: "Intake air temperature", unit: "°C", bytes: 1, decode: ([a = 0]) => a - 40 }
];

/** Strip prompt characters, whitespace and adapter status lines from a response. */
export function cleanElmResponse(raw: string): string {
  return raw
    .replace(/>/g, "")
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(SEARCHING\.\.\.|BUS INIT|OK|ELM327.*|STOPPED)$/i.test(l))
    .join("")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function isNoData(raw: string): boolean {
  return /NO ?DATA|UNABLE ?TO ?CONNECT|CAN ?ERROR|BUS ?ERROR|\?/i.test(raw);
}

/**
 * Parse a mode 01 response such as "410C1AF8" (headers off). Returns null when the
 * adapter reports no data or the echo does not match the requested PID.
 */
export function parsePidResponse(pid: string, raw: string): number | null {
  if (isNoData(raw)) return null;
  const def = OBD_PIDS.find((p) => p.pid === pid.toUpperCase());
  if (!def) return null;
  const hex = cleanElmResponse(raw);
  const expectedHeader = `41${def.pid.slice(2)}`;
  const at = hex.indexOf(expectedHeader);
  if (at < 0) return null;
  const dataHex = hex.slice(at + 4, at + 4 + def.bytes * 2);
  if (dataHex.length < def.bytes * 2) return null;
  const bytes: number[] = [];
  for (let i = 0; i < dataHex.length; i += 2) bytes.push(parseInt(dataHex.slice(i, i + 2), 16));
  if (bytes.some(Number.isNaN)) return null;
  return def.decode(bytes);
}

/**
 * Parse a mode 03 (stored DTC) response, e.g. "43010300000000" → ["P0103"].
 * Each code is two bytes: the top two bits select P/C/B/U.
 */
export function parseDtcResponse(raw: string): string[] {
  if (isNoData(raw)) return [];
  const hex = cleanElmResponse(raw);
  const codes: string[] = [];
  let i = hex.indexOf("43");
  if (i < 0) return [];
  i += 2;
  // CAN responses include a count byte after 43; legacy protocols don't. Detect by length parity.
  const rest = hex.slice(i);
  const payload = rest.length % 4 === 2 ? rest.slice(2) : rest;
  for (let j = 0; j + 4 <= payload.length; j += 4) {
    const word = parseInt(payload.slice(j, j + 4), 16);
    if (!word) continue;
    const system = ["P", "C", "B", "U"][(word >> 14) & 0x3]!;
    const d1 = (word >> 12) & 0x3;
    const rem = (word & 0x0fff).toString(16).toUpperCase().padStart(3, "0");
    codes.push(`${system}${d1}${rem}`);
  }
  return [...new Set(codes)];
}

export interface ObdHealthFlag {
  metric: ObdMetric | "dtc";
  level: "ok" | "watch" | "alert";
  message: string;
}

/** Simple, conservative interpretation for drivers. Values outside are flagged, not diagnosed. */
export function interpretObd(readings: Partial<Record<ObdMetric, number>>, dtcs: string[] = []): ObdHealthFlag[] {
  const flags: ObdHealthFlag[] = [];
  const c = readings.coolantC;
  if (typeof c === "number") {
    if (c >= 115) flags.push({ metric: "coolantC", level: "alert", message: `Coolant ${c}°C — stop and let the engine cool.` });
    else if (c >= 105) flags.push({ metric: "coolantC", level: "watch", message: `Coolant ${c}°C is running hot.` });
  }
  const v = readings.voltage;
  if (typeof v === "number") {
    if (v < 11.8) flags.push({ metric: "voltage", level: "alert", message: `System voltage ${v.toFixed(1)} V — battery or alternator problem likely.` });
    else if (v > 15.0) flags.push({ metric: "voltage", level: "watch", message: `System voltage ${v.toFixed(1)} V is high — check the charging system.` });
  }
  const f = readings.fuelPct;
  if (typeof f === "number" && f < 12) flags.push({ metric: "fuelPct", level: "watch", message: `Fuel at ${f}%.` });
  if (dtcs.length) flags.push({ metric: "dtc", level: "watch", message: `Stored fault codes: ${dtcs.join(", ")}. Have them read by a mechanic.` });
  return flags;
}
