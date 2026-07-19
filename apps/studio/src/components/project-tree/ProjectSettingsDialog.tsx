import {useEffect, useRef, useState, type KeyboardEvent} from "react";
import type {Project} from "@transport/domain";
import {validateProjectSettings, type EditableProjectSettings} from "../../app/projectMutations";

interface ProjectSettingsDialogProps {
  readonly project: Project;
  readonly onSave: (settings: EditableProjectSettings) => void;
  readonly onCancel: () => void;
}

export function ProjectSettingsDialog({project, onSave, onCancel}: ProjectSettingsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<EditableProjectSettings>(() => ({
    name: project.name,
    histories: project.runConfiguration.histories,
    batchSize: project.runConfiguration.batchSize,
    seed: project.runConfiguration.seed,
    visibleHistoryBudget: project.runConfiguration.visibleHistoryBudget,
  }));
  const [errors, setErrors] = useState<readonly string[]>([]);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  function submit() {
    const next = {...draft, name: draft.name.trim()};
    const nextErrors = validateProjectSettings(next);
    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return;
    }
    onSave(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("input, button") ?? [])]
      .filter((element) => !element.hasAttribute("disabled"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="project-settings-backdrop">
      <div ref={dialogRef} className="project-settings-dialog" role="dialog" aria-modal="true"
        aria-labelledby="project-settings-title" onKeyDown={handleKeyDown}>
        <div>
          <h2 id="project-settings-title">Project Settings</h2>
          <p className="muted compact">Project identity and modeled run controls</p>
        </div>

        {errors.length > 0 && <div className="inspector-edit-errors" role="alert" aria-label="Project Settings errors">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>}

        <form onSubmit={(event) => {event.preventDefault(); submit();}}>
          <label>Project name<input ref={firstInputRef} value={draft.name}
            onChange={(event) => setDraft({...draft, name: event.currentTarget.value})}/></label>
          <NumberSetting label="Histories" value={draft.histories} onChange={(histories) => setDraft({...draft, histories})}/>
          <NumberSetting label="Batch size" value={draft.batchSize} onChange={(batchSize) => setDraft({...draft, batchSize})}/>
          <NumberSetting label="Seed" value={draft.seed} onChange={(seed) => setDraft({...draft, seed})}/>
          <NumberSetting label="Visible history budget" value={draft.visibleHistoryBudget}
            onChange={(visibleHistoryBudget) => setDraft({...draft, visibleHistoryBudget})}/>
          <div className="project-settings-actions">
            <button type="button" onClick={onCancel}>Cancel</button>
            <button type="submit">Save Project Settings</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NumberSetting({label, value, onChange}: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}) {
  return <label>{label}<input type="number" step="1" value={Number.isFinite(value) ? value : ""}
    onChange={(event) => onChange(event.currentTarget.valueAsNumber)}/></label>;
}
