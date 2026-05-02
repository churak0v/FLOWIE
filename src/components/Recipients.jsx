import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../state/AppState';
import { AppShell } from './layout/AppShell';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';
import { RecipientSquareTile } from './domain/RecipientSquareTile';

export function Recipients() {
  const navigate = useNavigate();
  const { state, actions } = useAppState();
  const empty = state.recipients.items.length === 0;

  return (
    <>
      <AppShell style={{ display: 'flex', flexDirection: 'column', '--app-content-inset-bottom': '0px' }}>
        <Text variant="title">Люди</Text>

        {empty ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', textAlign: 'center' }}>
              <Text variant="subtitle">Пока пусто</Text>
              <div style={{ marginTop: 6 }}>
                <Text variant="body" muted>
                  Добавьте своего первого близкого человека в список для быстрых заказов.
                </Text>
              </div>
              <button
                type="button"
                onClick={() => navigate('/recipients/new')}
                style={{
                  marginTop: 12,
                  height: 44,
                  borderRadius: 'var(--r-lg)',
                  border: 0,
                  background: 'var(--accent)',
                  color: 'var(--c-white)',
                  fontWeight: 1000,
                  cursor: 'pointer',
                  padding: '0 14px',
                }}
              >
                Добавить
              </button>
            </Surface>
          </div>
        ) : (
          <div style={{ marginTop: 'var(--sp-6)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {state.recipients.items.map((r) => (
              <RecipientSquareTile
                key={r.id}
                recipient={r}
                onClick={() => {
                  actions.selectRecipient(r.id);
                  navigate(`/recipients/${r.id}`);
                }}
              />
            ))}
            <RecipientSquareTile variant="add" onClick={() => navigate('/recipients/new')} />
          </div>
        )}
      </AppShell>
    </>
  );
}
