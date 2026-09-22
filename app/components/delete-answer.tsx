"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export function DeleteAnswerButton({ id }: { id: string }) {
  const router = useRouter();
  const remove = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/answers/${id}`, { method: "DELETE" });

      if (!response.ok) throw new Error("Unable to delete this answer.");
    },
    retry: false,
    onSuccess: () => router.refresh(),
  });

  return (
    <div>
      <Button variant="outline" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
        {remove.isPending ? "Deleting…" : "Delete"}
      </Button>
      {remove.error && <p role="alert" className="mt-1 text-sm text-destructive">{remove.error.message}</p>}
    </div>
  );
}
