// The header of an overview section: a small gradient eyebrow, the heading and an optional paragraph.
import type { DefussChild, Props } from "defuss";

export interface SectionHeaderProps extends Props {
  id: string;
  eyebrow: string;
  title: string;
}

export function SectionHeader({ id, eyebrow, title, children }: SectionHeaderProps) {
  return (
    <header>
      <span class="home-eyebrow">{eyebrow}</span>
      <h2 id={id}>{title}</h2>
      {children}
    </header>
  );
}

/** A section of the overview page with its header; `id` names the heading the section is labelled by. */
export function HomeSection({ id, eyebrow, title, intro, children }: SectionHeaderProps & { intro?: DefussChild }) {
  return (
    <section class="home-section" aria-labelledby={id}>
      <SectionHeader id={id} eyebrow={eyebrow} title={title}>{intro === undefined ? null : <p>{intro}</p>}</SectionHeader>
      {children}
    </section>
  );
}
