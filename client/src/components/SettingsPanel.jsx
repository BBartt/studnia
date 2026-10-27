import { useEffect, useId, useRef, useState } from 'react';
import { SETTINGS_SCHEMA, settingsKeys } from '@studnia/shared/settings';
import styles from './SettingsPanel.module.css';

const SEND_DELAY_MS = 150;

/**
 * Formularz budowany ze wspólnego schematu. Gospodarz edytuje lokalny szkic
 * (płynne suwaki), a zmiany wysyłamy z małym opóźnieniem.
 */
export default function SettingsPanel({ settings, editable = true, onChange, scope }) {
  const [draft, setDraft] = useState(settings);
  const pending = useRef(null);

  useEffect(() => { if (!pending.current) setDraft(settings); }, [settings]);
  useEffect(() => () => clearTimeout(pending.current), []);

  const update = (key, value) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      onChange({ [key]: value });
    }, SEND_DELAY_MS);
  };

  return (
    <div className={styles.grid}>
      {settingsKeys(scope).map((key) => (
        <Setting key={key} spec={SETTINGS_SCHEMA[key]} value={draft[key]} disabled={!editable} onChange={(v) => update(key, v)} />
      ))}
    </div>
  );
}

function Setting({ spec, value, disabled, onChange }) {
  const id = useId();

  if (spec.kind === 'toggle') {
    return (
      <label className={`${styles.row} ${styles.toggleRow}`} htmlFor={id}>
        <span>
          <span className={styles.label}>{spec.label}</span>
          {spec.hint && <span className={styles.hint}>{spec.hint}</span>}
        </span>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className={styles.switch}
          checked={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    );
  }

  if (spec.kind === 'choice') {
    return (
      <fieldset className={styles.row} disabled={disabled}>
        <legend className={styles.label}>{spec.label}</legend>
        <div className={styles.segmented}>
          {spec.options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={value === o.value}
              className={value === o.value ? styles.segOn : styles.seg}
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  const percent = ((value - spec.min) / (spec.max - spec.min)) * 100;
  return (
    <div className={styles.row}>
      <div className={styles.rangeHead}>
        <label className={styles.label} htmlFor={id}>{spec.label}</label>
        <output htmlFor={id} className={styles.value}>{spec.format(value)}</output>
      </div>
      <input
        id={id}
        type="range"
        className={styles.range}
        style={{ '--fill': `${percent}%` }}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {spec.hint && <span className={styles.hint}>{spec.hint}</span>}
    </div>
  );
}

/** Krótkie, tylko do odczytu podsumowanie ustawień (np. przeciwnika). */
export function SettingsSummary({ settings, scope }) {
  return (
    <ul className={styles.summary}>
      {settingsKeys(scope).map((key) => {
        const spec = SETTINGS_SCHEMA[key];
        const v = settings[key];
        let text;
        if (spec.kind === 'range') text = spec.format(v);
        else if (spec.kind === 'choice') text = spec.options.find((o) => o.value === v)?.label ?? String(v);
        else text = v ? 'tak' : 'nie';
        const changed = v !== spec.default;
        return (
          <li key={key} data-changed={changed}>
            <span>{spec.label}</span>
            <strong>{text}</strong>
          </li>
        );
      })}
    </ul>
  );
}
