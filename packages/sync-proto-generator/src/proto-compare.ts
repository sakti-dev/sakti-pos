interface ProtoField {
  fieldNumber: number;
  label: string;
  name: string;
  type: string;
}

const HOT_MESSAGES = [
  "ProductRow",
  "OutletProductRow",
  "OrderRow",
  "OrderItemRow",
  "ProductChanges",
  "OutletProductChanges",
  "OrderChanges",
  "OrderItemChanges",
] as const;

const PROTO_FIELD_LINE_PATTERN =
  /^(?:(repeated)\s+)?([A-Za-z0-9_]+)\s+([a-z0-9_]+)\s+=\s+(\d+);$/;

function parseMessage(source: string, messageName: string): ProtoField[] {
  const pattern = new RegExp(
    `message ${messageName} \\{([\\s\\S]*?)\\n\\}`,
    "m"
  );
  const match = source.match(pattern);
  if (!match) {
    return [];
  }
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.match(PROTO_FIELD_LINE_PATTERN))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({
      fieldNumber: Number(m[4]),
      label: m[1] ?? "",
      name: m[3],
      type: m[2],
    }));
}

export function compareManualHotTableContract(
  currentProto: string,
  generatedProto: string
): string[] {
  const errors: string[] = [];
  for (const messageName of HOT_MESSAGES) {
    const current = parseMessage(currentProto, messageName);
    const generated = parseMessage(generatedProto, messageName);
    if (current.length === 0) {
      errors.push(`Current proto is missing ${messageName}`);
      continue;
    }
    if (generated.length === 0) {
      errors.push(`Generated proto is missing ${messageName}`);
      continue;
    }
    if (JSON.stringify(current) !== JSON.stringify(generated)) {
      errors.push(`${messageName} differs from current manual contract`);
    }
  }
  return errors;
}
