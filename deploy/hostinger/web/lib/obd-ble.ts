"use client";

import { ELM327_INIT, OBD_BLE_PROFILES, OBD_PIDS, parseDtcResponse, parsePidResponse, type ObdMetric } from "@kaafila/shared";

/* Minimal Web Bluetooth typings (not part of TypeScript's DOM lib). */
interface BleCharacteristic extends EventTarget {
  value?: DataView;
  properties: { write: boolean; writeWithoutResponse: boolean; notify: boolean };
  startNotifications(): Promise<BleCharacteristic>;
  writeValue(data: BufferSource): Promise<void>;
  writeValueWithoutResponse?(data: BufferSource): Promise<void>;
}
interface BleService {
  getCharacteristic(uuid: number | string): Promise<BleCharacteristic>;
}
interface BleServer {
  connected: boolean;
  getPrimaryService(uuid: number | string): Promise<BleService>;
  disconnect(): void;
}
interface BleDevice extends EventTarget {
  name?: string;
  gatt?: { connect(): Promise<BleServer> };
}
interface BluetoothApi {
  requestDevice(options: { acceptAllDevices?: boolean; filters?: unknown[]; optionalServices?: (number | string)[] }): Promise<BleDevice>;
}

export function bluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export class ElmBleClient {
  private buffer = "";
  private waiter: ((text: string) => void) | null = null;
  private constructor(
    readonly deviceName: string,
    readonly profile: string,
    private readonly server: BleServer,
    private readonly write: BleCharacteristic
  ) {}

  static async connect(): Promise<ElmBleClient> {
    const bt = (navigator as unknown as { bluetooth?: BluetoothApi }).bluetooth;
    if (!bt) throw new Error("Web Bluetooth is not available in this browser. Use Chrome or Edge on Android, Windows, macOS or ChromeOS.");
    const device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: OBD_BLE_PROFILES.map((p) => p.service) });
    if (!device.gatt) throw new Error("This device does not expose Bluetooth LE services.");
    const server = await device.gatt.connect();

    for (const profile of OBD_BLE_PROFILES) {
      try {
        const service = await server.getPrimaryService(profile.service);
        const write = await service.getCharacteristic(profile.write);
        const notify = await service.getCharacteristic(profile.notify);
        const client = new ElmBleClient(device.name ?? "OBD adapter", profile.name, server, write);
        await notify.startNotifications();
        notify.addEventListener("characteristicvaluechanged", (e) => client.onData((e.target as BleCharacteristic).value));
        return client;
      } catch {
        // try the next profile
      }
    }
    server.disconnect();
    throw new Error("Connected, but this adapter doesn't use a known OBD serial profile. It may be a Classic-Bluetooth-only adapter.");
  }

  private onData(view?: DataView) {
    if (!view) return;
    this.buffer += new TextDecoder().decode(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
    if (this.buffer.includes(">") && this.waiter) {
      const text = this.buffer;
      this.buffer = "";
      const w = this.waiter;
      this.waiter = null;
      w(text);
    }
  }

  /** Send one ELM command and wait for the '>' prompt. */
  async command(cmd: string, timeoutMs = 4000): Promise<string> {
    this.buffer = "";
    const data = new TextEncoder().encode(`${cmd}\r`);
    const reply = new Promise<string>((resolve, reject) => {
      const t = window.setTimeout(() => {
        this.waiter = null;
        reject(new Error(`Adapter did not answer ${cmd}`));
      }, timeoutMs);
      this.waiter = (text) => {
        window.clearTimeout(t);
        resolve(text);
      };
    });
    if (this.write.properties.writeWithoutResponse && this.write.writeValueWithoutResponse) await this.write.writeValueWithoutResponse(data);
    else await this.write.writeValue(data);
    return reply;
  }

  async init() {
    for (const cmd of ELM327_INIT) await this.command(cmd, cmd === "ATZ" ? 6000 : 3000).catch(() => "");
  }

  async readAll(): Promise<Partial<Record<ObdMetric, number>>> {
    const out: Partial<Record<ObdMetric, number>> = {};
    for (const pid of OBD_PIDS) {
      try {
        const value = parsePidResponse(pid.pid, await this.command(pid.pid, 3000));
        if (value !== null) out[pid.metric] = value;
      } catch {
        /* unsupported PID on this car */
      }
    }
    return out;
  }

  async readDtcs(): Promise<string[]> {
    return parseDtcResponse(await this.command("03", 5000));
  }

  disconnect() {
    if (this.server.connected) this.server.disconnect();
  }
}
