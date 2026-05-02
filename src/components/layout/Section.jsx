import React from 'react';
import { Text } from '../ui/Text';

export function Section({ title, children, right }) {
  return (
    <section style={{ marginTop: 'var(--sp-8)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Text as="h2" variant="title" className="ui-sectionTitle">
          {title}
        </Text>
        {right ? <div>{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

