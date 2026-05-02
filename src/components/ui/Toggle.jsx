import React from 'react';

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange?.(!checked)}
      className="ui-toggle"
    >
      {label ? <span className="ui-toggleLabel">{label}</span> : null}
      <span className={checked ? 'ui-toggleTrack ui-toggleTrack--on' : 'ui-toggleTrack'}>
        <span className={checked ? 'ui-toggleThumb ui-toggleThumb--on' : 'ui-toggleThumb'} />
      </span>
    </button>
  );
}

