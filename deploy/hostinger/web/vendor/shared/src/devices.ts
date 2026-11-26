/** Device connectivity model shared by API (pairing) and web (capability checks + guidance). */

export type DeviceKind = "phone" | "tablet" | "car_display" | "obd_adapter" | "dashcam" | "wearable";
export type DeviceRole = "primary" | "co_pilot" | "passenger" | "telemetry";

export const DEVICE_KINDS: { id: DeviceKind; label: string; role: DeviceRole; description: string }[] = [
  { id: "phone", label: "Phone", role: "primary", description: "Driver's phone: GPS, quick signals, SOS, voice." },
  { id: "tablet", label: "Dash tablet", role: "co_pilot", description: "Mounted display that shows the convoy map; operated by the navigator." },
  { id: "car_display", label: "Car display browser", role: "co_pilot", description: "In-car browser (where the car supports one) showing the cockpit." },
  { id: "obd_adapter", label: "OBD-II adapter", role: "telemetry", description: "ELM327 Bluetooth LE adapter in the OBD port for engine data." },
  { id: "dashcam", label: "Dashcam", role: "telemetry", description: "Footage stays on the dashcam; link clips to journey events." },
  { id: "wearable", label: "Wearable", role: "passenger", description: "Roadmap: native companion for haptic alerts." }
];

export type Capability =
  | "geolocation"
  | "wakeLock"
  | "bluetooth"
  | "deviceMotion"
  | "vibration"
  | "share"
  | "speechSynthesis"
  | "speechRecognition"
  | "notifications"
  | "nfc";

export const CAPABILITY_INFO: Record<Capability, { label: string; why: string; limits: string }> = {
  geolocation: { label: "GPS location", why: "Live position for the convoy map.", limits: "Foreground only in a browser; background tracking needs the native app." },
  wakeLock: { label: "Screen wake lock", why: "Keeps the cockpit screen on while driving.", limits: "Released when the tab is hidden." },
  bluetooth: { label: "Web Bluetooth", why: "Connects ELM327 BLE OBD-II adapters.", limits: "Chrome and Edge only. Not available on iOS Safari or Firefox." },
  deviceMotion: { label: "Motion sensors", why: "Crash-detection heuristic.", limits: "iOS asks for permission; accuracy varies by device." },
  vibration: { label: "Vibration", why: "Haptic alerts for signals and SOS.", limits: "Not supported on iOS." },
  share: { label: "Web Share", why: "Share invite links to WhatsApp and others.", limits: "Falls back to copy-to-clipboard." },
  speechSynthesis: { label: "Voice read-out", why: "Reads quick signals and assistant answers aloud.", limits: "Voices vary by OS." },
  speechRecognition: { label: "Voice commands", why: "Hands-free questions to the co-pilot.", limits: "Chrome/Edge and Safari; may need network." },
  notifications: { label: "Notifications", why: "Alerts while the app is open in another tab.", limits: "iOS needs the app installed to the Home Screen (16.4+)." },
  nfc: { label: "NFC", why: "Tap-to-join at meetups (roadmap).", limits: "Chrome on Android only." }
};

export const PAIRING_CODE_TTL_SECONDS = 10 * 60;

export function generatePairingCode(random: () => number = Math.random): string {
  return Math.floor(random() * 1_000_000)
    .toString()
    .padStart(6, "0");
}

export interface ConnectStep {
  title: string;
  detail: string;
}

export const CONNECT_GUIDES: Record<"co_pilot" | "obd" | "phone_mount" | "install_app", ConnectStep[]> = {
  install_app: [
    { title: "Open KAAFILA in your browser", detail: "Chrome on Android, Safari on iPhone, or any modern desktop browser." },
    { title: "Install to the home screen", detail: "Android: menu → Install app. iPhone: Share → Add to Home Screen. This enables full-screen and notifications." },
    { title: "Allow location", detail: "Choose 'While using the app'. KAAFILA only shares location with members of convoys you join." },
    { title: "Keep the cockpit open while driving", detail: "Browsers pause GPS in the background. The wake lock keeps the screen on; plug the phone into a charger." }
  ],
  co_pilot: [
    { title: "On the driver's phone", detail: "Connect → Pair a device. Pick the car. A 6-digit code and QR appear for 10 minutes." },
    { title: "On the tablet or passenger phone", detail: "Open KAAFILA, sign in, Connect → Enter code (or scan the QR)." },
    { title: "Done", detail: "The second device joins as that car's co-pilot: it shows the map, chat and intel, so the driver keeps hands on the wheel." }
  ],
  obd: [
    { title: "Get a BLE adapter", detail: "Use an ELM327-compatible adapter that supports Bluetooth Low Energy (BLE 4.0+). Classic-Bluetooth-only adapters can't connect to browsers." },
    { title: "Find the OBD-II port", detail: "Usually under the dashboard on the driver's side, near the steering column. Most modern cars have one — your owner's manual shows the exact spot." },
    { title: "Ignition on", detail: "Plug the adapter in, turn the ignition on (engine running gives voltage and live data)." },
    { title: "Connect from Chrome or Edge", detail: "Garage → Connect OBD → choose the adapter. If nothing reads, retry with another adapter profile." },
    { title: "Read the data", detail: "Live RPM, speed, coolant, fuel level and battery voltage, plus stored fault codes." }
  ],
  phone_mount: [
    { title: "Mount at eye level", detail: "Use a dashboard or vent mount where it doesn't block your view or an airbag." },
    { title: "Power it", detail: "GPS and screen-on drain the battery; use a car charger." },
    { title: "Use quick signals, not typing", detail: "While moving, the cockpit shows only big buttons. Let the navigator handle chat." }
  ]
};
