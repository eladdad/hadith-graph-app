import type { CSSProperties, ReactNode } from 'react';

interface LinkifiedTextProps {
  className?: string;
  style?: CSSProperties;
  text: string;
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_URL_PUNCTUATION = /[.,;:!?]+$/;

function toHref(urlText: string): string {
  return urlText.startsWith('http://') || urlText.startsWith('https://')
    ? urlText
    : `https://${urlText}`;
}

function splitUrlSuffix(urlText: string): { url: string; suffix: string } {
  const suffixMatch = urlText.match(TRAILING_URL_PUNCTUATION);
  if (!suffixMatch) {
    return { url: urlText, suffix: '' };
  }

  return {
    url: urlText.slice(0, -suffixMatch[0].length),
    suffix: suffixMatch[0],
  };
}

export function LinkifiedText({
  className,
  style,
  text,
}: LinkifiedTextProps) {
  if (text.length === 0) {
    return null;
  }

  const content: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const matchedText = match[0];
    if (start > lastIndex) {
      content.push(text.slice(lastIndex, start));
    }

    const { url, suffix } = splitUrlSuffix(matchedText);
    if (url.length > 0) {
      content.push(
        <a
          key={`link-${start}`}
          href={toHref(url)}
          target="_blank"
          rel="noreferrer noopener"
        >
          {url}
        </a>,
      );
    }

    if (suffix.length > 0) {
      content.push(suffix);
    }

    lastIndex = start + matchedText.length;
  }

  if (lastIndex < text.length) {
    content.push(text.slice(lastIndex));
  }

  return (
    <div className={className} style={style} dir="auto">
      {content}
    </div>
  );
}
