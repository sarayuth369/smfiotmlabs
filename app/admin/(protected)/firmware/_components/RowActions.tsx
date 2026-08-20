"use client";

import { useTransition } from "react";
import { approveFirmwareRelease, setFirmwareLatest, deprecateFirmwareRelease } from "../actions";

export function RowActions({
  releaseId,
  approved,
  isLatest,
  isDeprecated,
}: {
  releaseId: string;
  approved: boolean;
  isLatest: boolean;
  isDeprecated: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap gap-1.5">
      {!approved && !isDeprecated && (
        <button
          onClick={() => start(() => approveFirmwareRelease(releaseId))}
          disabled={pending}
          className="text-[11px] rounded-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold px-3 py-1"
        >
          Approve
        </button>
      )}
      {approved && !isLatest && !isDeprecated && (
        <button
          onClick={() => start(() => setFirmwareLatest(releaseId))}
          disabled={pending}
          className="text-[11px] rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold px-3 py-1"
        >
          Set Latest
        </button>
      )}
      {!isDeprecated && (
        <button
          onClick={() => {
            if (confirm("Deprecate นี่จริงหรือ? User จะไม่เห็น release นี้อีก")) {
              start(() => deprecateFirmwareRelease(releaseId));
            }
          }}
          disabled={pending}
          className="text-[11px] rounded-full border border-brand-200 hover:border-red-300 hover:text-red-700 text-brand-800 font-semibold px-3 py-1"
        >
          Deprecate
        </button>
      )}
    </div>
  );
}
