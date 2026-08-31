"use client";

import { useEffect, useState } from "react";
import { Autocomplete, TextField, CircularProgress } from "@mui/material";

/** Multi-select autocomplete for genres or tags, backed by a search
 * endpoint (GET /api/genres?q= or GET /api/tags?q=). Lets the user pick
 * an existing entity or type a brand-new one (freeSolo) — new values are
 * resolved (matched or created) server-side on save via
 * resolveOrCreateGenre/Tag, so no client-side validation against the
 * entity list is needed here. */
export default function GenreTagAutocomplete({
  label,
  endpoint,
  value,
  onChange,
}: {
  label: string;
  endpoint: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = inputValue.trim();
    const timeout = setTimeout(() => {
      if (!trimmed) {
        setOptions([]);
        return;
      }
      setLoading(true);
      fetch(`${endpoint}?q=${encodeURIComponent(trimmed)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data: { name: string }[]) => setOptions(data.map((d) => d.name)))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [inputValue, endpoint]);

  return (
    <Autocomplete
      multiple
      freeSolo
      options={options}
      value={value}
      inputValue={inputValue}
      onInputChange={(_, newInput) => setInputValue(newInput)}
      onChange={(_, newValue) => onChange(newValue as string[])}
      loading={loading}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          slotProps={{
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {loading && <CircularProgress size={16} />}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
