"use client";

import { useId, type ReactElement } from "react";

import { Checkbox } from "@/components/ui/checkbox";

/**
 * The states a product is sold, offered for sale or distributed in or into
 * (Rule 8.6) — every state and DC, by name, as checkboxes in a scrolling
 * box so the dialog's footer stays reachable on a phone.
 */
export function StatePicker({
  options,
  selected,
  onChange,
  label,
}: {
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
    readonly code: string;
  }[];
  readonly selected: ReadonlySet<string>;
  readonly onChange: (next: ReadonlySet<string>) => void;
  readonly label: string;
}): ReactElement {
  const groupId = useId();
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={`${groupId}-count`}
    >
      <legend className="text-label text-foreground">{label}</legend>
      <p id={`${groupId}-count`} className="text-caption text-muted-foreground">
        {selected.size === 0 ? "None chosen" : `${selected.size} chosen`}
      </p>
      <ul className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
        {options.map((option) => {
          const id = `${groupId}-${option.value}`;
          const isChecked = selected.has(option.value);
          return (
            <li key={option.value}>
              <label
                htmlFor={id}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-body hover:bg-muted"
              >
                <Checkbox
                  id={id}
                  checked={isChecked}
                  data-state-option={option.code}
                  onCheckedChange={(state) => {
                    const next = new Set(selected);
                    if (state === true) next.add(option.value);
                    else next.delete(option.value);
                    onChange(next);
                  }}
                />
                <span>{option.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
