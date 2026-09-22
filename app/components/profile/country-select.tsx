import { COUNTRIES } from "@/lib/geo/regions";
import { control } from "./constants";

export function CountrySelect({
  value,
  onChange,
  id,
  empty = "Not set",
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  empty?: string;
}) {
  return (
    <select
      id={id}
      className={control}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{empty}</option>
      {COUNTRIES.map(({ code, name }) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </select>
  );
}
