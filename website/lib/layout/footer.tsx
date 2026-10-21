// VERIFIED: footer of every page, like the audio-tag site's: the license and what the site is built with, then the build line
// (version, commit, build time, gzipped library size).
import { BUILD_INFO } from "../build-info.ts";

const REPOSITORY = "https://github.com/Mansi1/blendfile";
// External links open in a new tab, as in the top bar.
const NEW_TAB = { target: "_blank", rel: "noopener" };
const formatTime = (date: Date) => `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

export function Footer() {
  const { version, commit, builtAt, gzippedBytes } = BUILD_INFO;
  return (
    <footer class="site-footer">
      <div class="page">
        <span><a href={`${REPOSITORY}/blob/main/LICENSE`} {...NEW_TAB}>MIT licensed</a> · built with <a href="https://github.com/kyr0/defuss" {...NEW_TAB}>defuss</a> and <a href="https://github.com/kyr0/defuss-shadcn" {...NEW_TAB}>defuss-shadcn</a></span>
        <span class="build">
          <a href="https://www.npmjs.com/package/blendfile" {...NEW_TAB}>v{version}</a>
          {commit ? <> · <a href={`${REPOSITORY}/commit/${commit}`} {...NEW_TAB}>{commit}</a></> : null}
          {" · "}<time datetime={builtAt.toISOString()}>{formatTime(builtAt)}</time>
          {gzippedBytes === undefined ? null : <> · <span class="nowrap">{(gzippedBytes / 1024).toFixed(1)} KB gzipped</span></>}
        </span>
      </div>
    </footer>
  );
}
