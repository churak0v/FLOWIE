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
        Здесь будет размещена политика конфиденциальности и описание обработки персональных данных.
      </Text>
      <Text variant="body" muted>
        MVP: текст можно обновить позже без изменения логики приложения.
      </Text>
    </LegalPage>
  );
}

export function DataProcessingConsent() {
  return (
    <LegalPage title="Согласие на обработку данных">
      <Text variant="body" muted>
        Нажимая кнопку и продолжая использование сервиса, вы подтверждаете согласие на обработку персональных данных
        в целях оформления и доставки заказов, связи с вами и улучшения сервиса.
      </Text>
      <Text variant="body" muted>
        MVP: рекомендуется заменить на юридически выверенный текст перед запуском в прод.
      </Text>
    </LegalPage>
  );
}

export function PublicOffer() {
  return (
    <LegalPage title="Публичная оферта">
      <Text variant="body" muted>
        Здесь будет размещена публичная оферта (условия продажи и доставки).
      </Text>
      <Text variant="body" muted>
        MVP: добавьте финальный текст оферты и реквизиты компании.
      </Text>
    </LegalPage>
  );
}

