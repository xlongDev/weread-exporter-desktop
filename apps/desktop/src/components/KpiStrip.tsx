interface KpiItem {
  label: string;
  value: number | string;
}

/** KPI 是文字不是瓷砖：1px hairline 分隔的纯文字条（docs/09 §5 KpiStrip） */
export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="flex divide-x divide-rule">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col gap-1 pr-8 pl-0 first:pl-0 [&:not(:first-child)]:pl-8">
          <span className="text-xs text-muted">{it.label}</span>
          <span className="tnum text-3xl leading-none font-normal">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
