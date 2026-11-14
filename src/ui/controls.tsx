// Small shared controls. Native inputs, so Tab, arrows and screen readers work without extra code.
import { useId } from "react";

export function Slider(props: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId();
  return (
    <div className="ui-control">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(props.value * 100)}
        onChange={(event) => { props.onChange(Number(event.target.value) / 100); }}
      />
      <span className="value" aria-hidden="true">{Math.round(props.value * 100)}%</span>
    </div>
  );
}

export function Toggle(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <div className="ui-control">
      <label htmlFor={id}>{props.label}</label>
      <input id={id} type="checkbox" role="switch" checked={props.checked} onChange={(event) => { props.onChange(event.target.checked); }} />
      <span className="value" aria-hidden="true">{props.checked ? "On" : "Off"}</span>
    </div>
  );
}

export function Select<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { readonly value: T; readonly label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="ui-control">
      <label htmlFor={id}>{props.label}</label>
      <select
        id={id}
        value={props.value}
        onChange={(event) => {
          const picked = props.options.find((option) => option.value === event.target.value);
          if (picked) props.onChange(picked.value);
        }}
      >
        {props.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <span />
    </div>
  );
}
