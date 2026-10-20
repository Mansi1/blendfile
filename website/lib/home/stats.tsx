// The band of numbers under the hero.
const STATS = [
  { value: "3", label: "block header layouts" },
  { value: "2", label: "compression formats" },
  { value: "993", label: "struct types in a 5.2 file" },
  { value: "0", label: "native dependencies" },
];

export function Stats() {
  return (
    <section class="mk-stats" aria-label="At a glance">
      <div class="mk-stats-band">
        {STATS.map((stat) => (
          <div class="mk-stat" key={stat.label}><span class="mk-stat-value">{stat.value}</span><span class="mk-stat-label">{stat.label}</span></div>
        ))}
      </div>
    </section>
  );
}
