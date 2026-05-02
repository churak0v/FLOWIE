import React, { useMemo } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Text } from '../ui/Text';

const SECTION_RE = /^(\d{1,2})[).]\s*(.+)$/;
const BULLET_RE = /^[•*\-–—]\s*(.+)$/;

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .trim();
}

function parseDescription(rawText) {
  const text = normalizeText(rawText);
  if (!text) return null;

  const lines = text.split('\n');
  const hasSections = lines.some((l) => SECTION_RE.test(String(l || '').trim()));

  if (hasSections) {
    const intro = [];
    const sections = [];
    let current = null;

    const flush = () => {
      if (!current) return;
      const hasTitle = Boolean(String(current.title || '').trim());
      const hasItems = Array.isArray(current.items) && current.items.length > 0;
      if (hasTitle || hasItems) sections.push(current);
      current = null;
    };

    for (const line of lines) {
      const t = String(line || '').trim();
      if (!t) continue;

      const sm = t.match(SECTION_RE);
      if (sm) {
        flush();
        current = { index: Number(sm[1]), title: String(sm[2] || '').trim(), items: [] };
        continue;
      }

      const bm = t.match(BULLET_RE);
      if (bm) {
        if (!current) current = { index: null, title: '', items: [] };
        current.items.push(String(bm[1] || '').trim());
        continue;
      }

      if (!current) {
        intro.push(t);
      } else {
        current.items.push(t);
      }
    }

    flush();
    if (!intro.length && !sections.length) return null;
    return { type: 'sections', intro, sections };
  }

  const blocks = [];
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push({ type: 'list', items: list });
    list = [];
  };

  for (const line of lines) {
    const t = String(line || '').trim();
    if (!t) {
      flushParagraph();
      flushList();
      continue;
    }

    const bm = t.match(BULLET_RE);
    if (bm) {
      flushParagraph();
      list.push(String(bm[1] || '').trim());
    } else {
      flushList();
      paragraph.push(t);
    }
  }

  flushParagraph();
  flushList();
  return blocks.length ? { type: 'blocks', blocks } : null;
}

function CheckItem({ children }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          background: 'var(--c-accent-10)',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <Check size={12} color="var(--c-accent)" strokeWidth={3} />
      </span>
      <Text variant="body" muted>
        {children}
      </Text>
    </div>
  );
}

function SectionAccordion({ index, title, items, defaultOpen = false }) {
  const safeTitle = String(title || '').trim() || 'Подробнее';
  return (
    <details className="ui-accordion" open={Boolean(defaultOpen)}>
      <summary className="ui-accordion__summary">
        {index != null ? (
          <span
            aria-hidden="true"
            className="ui-accordion__badge"
            style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              background: 'var(--c-accent-10)',
              border: '1px solid var(--c-accent-border)',
              color: 'var(--c-accent)',
              fontWeight: 1000,
              fontSize: 12,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            {index}
          </span>
        ) : null}

        <span style={{ flex: 1, minWidth: 0 }}>
          <Text as="span" variant="subtitle" style={{ fontWeight: 900 }}>
            {safeTitle}
          </Text>
        </span>

        <span aria-hidden="true" className="ui-accordion__chevron" style={{ marginTop: 2 }}>
          <ChevronDown size={18} color="var(--c-text-muted)" strokeWidth={3} />
        </span>
      </summary>

      {Array.isArray(items) && items.length ? (
        <div className="ui-accordion__content">
          {items.map((it, idx) => (
            <CheckItem key={idx}>{it}</CheckItem>
          ))}
        </div>
      ) : null}
    </details>
  );
}

export function ProductDescription({ text, defaultOpen = 'none' }) {
  const parsed = useMemo(() => parseDescription(text), [text]);
  if (!parsed) return null;

  if (parsed.type === 'sections') {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        {parsed.intro?.length ? (
          <Text variant="body" muted style={{ whiteSpace: 'pre-line' }}>
            {parsed.intro.join('\n')}
          </Text>
        ) : null}

        {parsed.sections?.map((s, idx) => (
          <SectionAccordion
            key={idx}
            index={s.index}
            title={s.title}
            items={s.items}
            defaultOpen={defaultOpen === 'all' ? true : defaultOpen === 'first' ? idx === 0 : false}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {parsed.blocks?.map((b, idx) => {
        if (b.type === 'list') {
          return (
            <div key={idx} style={{ display: 'grid', gap: 8 }}>
              {b.items.map((it, j) => (
                <CheckItem key={j}>{it}</CheckItem>
              ))}
            </div>
          );
        }
        return (
          <Text key={idx} variant="body" muted style={{ whiteSpace: 'pre-line' }}>
            {b.text}
          </Text>
        );
      })}
    </div>
  );
}
