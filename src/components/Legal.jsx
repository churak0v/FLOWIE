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
        <IconButton onClick={() => navigate(-1)} aria-label="Назад">
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
    <LegalPage title="Политика конфиденциальности">
      <Text variant="body" muted>
        Flowie использует контактные данные клиента и информацию о доставке только для оформления, проверки и выполнения заказов цветов.
      </Text>
      <Text variant="body" muted>
        Адреса доставки доступны флористу и курьеру только для выполнения заказа. Перед запуском этот MVP-текст нужно заменить финальной юридической редакцией.
      </Text>
    </LegalPage>
  );
}

export function DataProcessingConsent() {
  return (
    <LegalPage title="Согласие на обработку данных">
      <Text variant="body" muted>
        Продолжая, вы соглашаетесь на обработку данных, необходимых для оформления цветочных заказов, связи с клиентом,
        координации доставки и поддержки повторных заказов.
      </Text>
      <Text variant="body" muted>
        MVP-уведомление: перед запуском замените этот текст согласованной юридической формулировкой.
      </Text>
    </LegalPage>
  );
}

export function PublicOffer() {
  return (
    <LegalPage title="Публичная оферта">
      <Text variant="body" muted>
        Flowie позволяет заказывать реальные букеты с прозрачной оплатой, сборкой флористом, курьерской доставкой и статусом заказа.
      </Text>
      <Text variant="body" muted>
        MVP-уведомление: перед запуском добавьте финальные коммерческие условия, правила оплаты, возвраты и реквизиты компании.
      </Text>
    </LegalPage>
  );
}
