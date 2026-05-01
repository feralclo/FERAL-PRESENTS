"use client";

import { QuestCardPreview } from "../QuestCardPreview";
import { questTypeFor, type QuestFormState } from "./types";

/**
 * Phone-frame mirror of the iOS quest card. Wraps the existing
 * `QuestCardPreview` (already used in the legacy editor) so the rebuild
 * inherits the shape iOS already ships. Phase 1.3 dresses the surrounding
 * frame and wires the live click-to-pulse behaviour.
 */
export interface QuestPreviewProps {
  state: QuestFormState;
}

export function QuestPreview({ state }: QuestPreviewProps) {
  // No `kind` selected = no preview to render. The orchestrator only
  // mounts this once a kind has been picked, but guard anyway.
  if (!state.kind) return null;

  const questType = questTypeFor(state.kind, state.socialSubType);

  return (
    <div className="md:sticky md:top-4">
      <QuestCardPreview
        title={state.title}
        subtitle={state.subtitle ?? ""}
        coverImageUrl={state.cover_image_url ?? ""}
        promoterAccentHex={null}
        questType={questType}
        xp={state.xp_reward}
        ep={state.ep_reward}
        proofType={state.proof_type}
      />
    </div>
  );
}
