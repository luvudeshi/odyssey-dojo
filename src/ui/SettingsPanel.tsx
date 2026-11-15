// The settings. Each change applies at once and is saved by the store. "Play with" is read when Story mode or the Training Dojo next starts.
import { setSettings, useSettings } from "../settings/store";
import { Dialog } from "./Dialog";
import { Button, Select, Slider, Toggle } from "./pebble";

const CONTROLS = [{ value: "camera", label: "Camera (your body)" }, { value: "keyboard", label: "Keyboard" }] as const;
const QUALITY = [{ value: "high", label: "High" }, { value: "low", label: "Low (faster)" }] as const;

export function SettingsPanel(props: { onClose: () => void }) {
  const settings = useSettings();
  return (
    <Dialog title="Settings" onEscape={props.onClose}>
      <div className="ui-rows">
        <Select label="Play with" value={settings.controls} options={CONTROLS} onChange={(controls) => { setSettings({ controls }); }} />
        <Select label="Graphics quality" value={settings.quality} options={QUALITY} onChange={(quality) => { setSettings({ quality }); }} />
        <Slider label="Music volume" value={settings.musicVolume} onChange={(musicVolume) => { setSettings({ musicVolume }); }} />
        <Slider label="Effects volume" value={settings.sfxVolume} onChange={(sfxVolume) => { setSettings({ sfxVolume }); }} />
        <Slider label="Voice volume" value={settings.voiceVolume} onChange={(voiceVolume) => { setSettings({ voiceVolume }); }} />
        <Toggle label="Mirror webcam picture" checked={settings.mirror} onChange={(mirror) => { setSettings({ mirror }); }} />
        <Toggle label="Show key hints" checked={settings.keyHints} onChange={(keyHints) => { setSettings({ keyHints }); }} />
      </div>
      <Button onClick={props.onClose}>Back</Button>
    </Dialog>
  );
}
