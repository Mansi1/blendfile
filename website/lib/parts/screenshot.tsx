// A framed screenshot with an optional caption.
import type { Props } from "defuss";

export interface ScreenshotProps extends Props {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
}

// Lazy loading is a native <img> attribute the defuss JSX types do not declare yet.
const LAZY: Record<string, string> = { loading: "lazy" };

export function Screenshot({ src, alt, width, height, caption }: ScreenshotProps) {
  return (
    <figure class="screenshot">
      <img src={src} alt={alt} width={width} height={height} {...LAZY} />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
