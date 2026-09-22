"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CVForm } from "./cv-form";
import { CVs } from "./cvs";

export function CVUploader({ userId }: { userId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your CVs</CardTitle>
      </CardHeader>

      <CardContent className="gap-6">
        <CVForm userId={userId} />

        <CVs userId={userId} />
      </CardContent>
    </Card>
  );
}
