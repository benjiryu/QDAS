import { useId, useState } from 'react';
import type { CodePanelApi } from './useCodePanel';

/**
 * Creating a provisional code.
 *
 * Specification: docs/patterns/code-selection.md section 7 as amended by D-046,
 * and decision D-039.
 *
 * A name and nothing else. Section 7 required a short definition too, and D-046
 * removed it: proposing a code happens mid-coding, and asking for two fields of
 * prose at that moment is asking a coder to stop coding and start writing a
 * codebook entry. The name is what labels the excerpt; the definition can come
 * later, on the surface built for reading them.
 *
 * The code is checked immediately and appears under Proposed codes, never in the
 * canonical codebook: that structure does not change until a qualitative lead
 * approves it.
 *
 * The name field's ref belongs to the disclosure that wraps this, which is what
 * moves focus into it on expanding.
 *
 * Creation goes through `proposeFromForm`, the same core the empty-search
 * accelerator uses — per D-073, two routes and one flow. What differs is the
 * sentence spoken and where focus lands, which belong to the door rather than
 * to the code.
 */
interface CreateCodeFormProps {
  panel: CodePanelApi;
  nameRef: React.RefObject<HTMLInputElement | null>;
  /** Called once a code exists, so the disclosure can collapse and return focus. */
  onCreated: () => void;
}

export function CreateCodeForm({ panel, nameRef, onCreated }: CreateCodeFormProps) {
  const nameId = useId();
  const errorId = useId();

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();

    // Errors say what happened and what is still there, per contract 2.6.
    if (name.trim() === '') {
      setError('A code needs a name. Nothing you typed has been lost.');
      nameRef.current?.focus();
      return;
    }

    const created = panel.proposeFromForm(name);
    if (!created) {
      // The only way `proposeFromForm` refuses a non-empty name: something
      // already has it. Said here rather than swallowed, because two
      // provisional codes a coder cannot tell apart is what the guard exists
      // to prevent and a silent no-op would look like a broken button.
      setError('Another code already has that name. Nothing you typed has been lost.');
      nameRef.current?.focus();
      return;
    }

    // The form empties only once the code exists, so a failed attempt never
    // costs the coder what they wrote.
    setName('');
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

      <button type="submit">Create provisional code</button>
    </form>
  );
}
