"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";

import { CreateContainerDialog } from "@/components/storage/create-container-dialog";

import { createContainer } from "../actions";
import { NEW_CONTAINER } from "../container-copy";

/**
 * **New container** — `/containers`' primary action, in `RecordTable`'s
 * toolbar (§3.9). The reader chooses the segregation class (T-23), because a
 * container holds one class for life; the site's zone comes from the
 * organization, and no start date exists until the first battery goes in
 * (Rule 4.4). On success it opens the new container.
 */
export function NewContainerAction({
  typeOptions,
}: {
  readonly typeOptions: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}): ReactElement {
  const router = useRouter();
  return (
    <CreateContainerDialog
      triggerLabel={NEW_CONTAINER}
      typeOptions={typeOptions}
      requiredTypeLabel={null}
      onCreate={(input) => createContainer(input)}
      onCreated={(id) => router.push(`/containers/${id}`)}
    />
  );
}
