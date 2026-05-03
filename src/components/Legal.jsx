import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';

function LegalPage({ title, children }) {
  const navigate = useNavigate();
  return (
    <AppShell style={{ '--app-shell-bottom-space': '0px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <IconButton onClick={() => navigate(-1)} aria-label="Back">
          <ChevronLeft size={22} />
        </IconButton>
        <Text variant="title">{title}</Text>
      </div>

      <div style={{ marginTop: 'var(--sp-6)' }}>
        <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            {children}
          </div>
        </Surface>
      </div>
    </AppShell>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy policy">
      <Text variant="body" muted>
        Flowie uses buyer contact details and private delivery information only to process, verify, and fulfill gift orders.
      </Text>
      <Text variant="body" muted>
        Recipient addresses are not shown to buyers. Replace this MVP text with final legal wording before production launch.
      </Text>
    </LegalPage>
  );
}

export function DataProcessingConsent() {
  return (
    <LegalPage title="Data processing consent">
      <Text variant="body" muted>
        By continuing, you consent to processing the data required to create profiles, place gifts, contact buyers,
        coordinate delivery, and protect recipient privacy.
      </Text>
      <Text variant="body" muted>
        MVP notice: replace this copy with reviewed legal text before launch.
      </Text>
    </LegalPage>
  );
}

export function PublicOffer() {
  return (
    <LegalPage title="Public offer">
      <Text variant="body" muted>
        Flowie lets buyers purchase real gifts from creator wishlists with private fulfillment and transparent order status.
      </Text>
      <Text variant="body" muted>
        MVP notice: add final commercial terms, payment rules, refund policy, and company details before launch.
      </Text>
    </LegalPage>
  );
}
