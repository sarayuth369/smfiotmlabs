"use client";

import { useState } from "react";
import { UserDetailModal } from "./UserDetailModal";

export function UsernameCell({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-xs text-brand-700 hover:text-brand-900 hover:underline underline-offset-2"
      >
        {username}
      </button>
      {open && <UserDetailModal username={username} onClose={() => setOpen(false)} />}
    </>
  );
}
