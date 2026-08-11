import { useId, useRef, useState } from 'react';
import type { CodePanelApi } from './useCodePanel';

/**
 * Creating a provisional code.
 *
 * Specification: docs/patterns/code-selection.md section 7, decision D-039.
 *
 * Name and short definition are required, full definition is optional. The code
 * is checked immediately and appears under Proposed codes, never in the
 * canonical codebook: that structure does not change until a qualitative lead
 * approves it.
 *
 * The name field's ref belongs to the disclosure that wraps this, which is what
 * moves focus into it on expanding.
 */
interface CreateCodeFormProps {
  panel: CodePanelApi;
  nameRef: React.RefObject<HTMLInputElement | null>;
  /** Called once a code exists, so the disclosure can collapse and return focus. */
  onCreated: () => void;
}

export function CreateCodeForm({ panel, nameRef, onCreated }: CreateCodeFormProps) {
  const nameId = useId();
  const shortId = useId();
  const fullId = useId();
  const errorId = useId();

  const shortRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState('');
  const [shortDefinition, setShortDefinition] = useState('');
  const [fullDefinition, setFullDefinition] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();

    // Errors say what happened and what is still there, per contract 2.6.
    if (name.trim() === '') {
      setError('A code needs a name. Nothing you typed has been lost.');
      nameRef.current?.focus();
      return;
    }
    if (shortDefinition.trim() === '') {
      setError('A code needs a short definition. Nothing you typed has been lost.');
      shortRef.current?.focus();
      return;
    }

    const created = panel.createProvisionalCode({ name, shortDefinition, fullDefinition });
    if (!created) return;

    // The form empties only once the code exists, so a failed attempt never
    // costs the coder what they wrote.
    setName('');
    setShortDefinition('');
    setFullDefinition('');
    setError(null);
    onCreated();
  }

  return (
    <form className="code-panel__create" onSubmit={submit} noValidate>
      {error ? (
        <p id={errorId} className="code-panel__error">
          {error}
        </p>
      ) : null}

      <div className="code-panel__field">
        <label htmlFor={nameId}>Code name</label>
        <input
          id={nameId}
          ref={nameRef}
          type="text"
          value={name}
          required
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="code-panel__field">
        <label htmlFor={shortId}>Short definition</label>
        <input
          id={shortId}
          ref={shortRef}
          type="text"
          value={shortDefinition}
          required
          onChange={(event) => setShortDefinition(event.target.value)}
        />
      </div>

      <div className="code-panel__field">
        <label htmlFor={fullId}>Full definition (optional)</label>
        <textarea
          id={fullId}
          rows={2}
          value={fullDefinition}
          onChange={(event) => setFullDefinition(event.target.value)}
        />
      </div>

      <button type="submit">Create provisional code</button>
    </form>
  );
}
