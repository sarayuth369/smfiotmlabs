"use client";

import { useState, useTransition } from "react";
import { adminCancelOtaJob, adminRetryOtaJob } from "../actions";

export function JobActions({
  jobId,
  canRetry,
  canCancel,
}: {
  jobId: string;
  state: string;
  canRetry: boolean;
  canCancel: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1.5">
        {canCancel && (
          <button
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await adminCancelOtaJob(jobId);
                if (!res.ok) setError(res.error ?? "cancel failed");
              })
            }
            disabled={pending}
            className="text-[11px] rounded-full border border-brand-200 hover:border-red-300 hover:text-red-700 text-brand-800 font-semibold px-3 py-1"
          >
            Cancel
          </button>
        )}
        {canRetry && (
          <button
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await adminRetryOtaJob(jobId);
                if (!res.ok) setError(res.error ?? "retry failed");
              })
            }
            disabled={pending}
            className="text-[11px] rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold px-3 py-1"
          >
            Retry
          </button>
        )}
      </div>
      {error && <div className="text-[10px] text-red-700 max-w-[160px]">{error}</div>}
    </div>
  );
}
