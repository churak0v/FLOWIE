import React, { useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  BadgeCheck,
  ChevronLeft,
  Flower2,
  Heart,
  MoveHorizontal,
  Play,
  ShieldCheck,
  Sparkles,
  Truck,
} from 'lucide-react';
import { useAppState } from '../state/AppState';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';
import { AppImage } from './ui/AppImage';
import { ProductCard } from './domain/ProductCard';
import { OrderHistoryList } from './domain/OrderHistoryList';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1526045612212-70caf35c14df?auto=format&fit=crop&w=900&q=80';
const DELIVERY_IMAGE =
  'https://images.unsplash.com/photo-1526045612212-70caf35c14df?auto=format&fit=crop&w=900&q=80';
const DELIVERY_HANDLE = '@flowie.delivery';
const MOMENT_VIDEO = '/videos/vivienne-reaction.mp4';
const RAIL_CARD_WIDTH = 188;
const RAIL_CARD_HEIGHT = 334;

function normalizePublicRecipient(recipient, id) {
  if (!recipient) return null;
  const looksLikeLegacyProfile =
    Number(id) === 2 ||
    Number(id) === 2002 ||
    String(recipient?.name || '').trim().toLowerCase() === 'vivienne';

  if (!looksLikeLegacyProfile) return recipient;
  return {
    ...recipient,
    id: recipient.id ?? id,
    name: 'Получатель',
    handle: DELIVERY_HANDLE,
    image: DELIVERY_IMAGE,
  };
}

function SafetyRow({ icon: Icon, title, text }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background: 'var(--c-accent-10)',
          color: 'var(--accent)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={17} />
      </span>
      <div style={{ minWidth: 0 }}>
        <Text variant="subtitle">{title}</Text>
        <Text variant="caption" muted style={{ marginTop: 4, lineHeight: 1.35 }}>
          {text}
        </Text>
      </div>
    </div>
  );
}

function FunnelHeader({ title, subtitle, action, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 }}>
      <div style={{ minWidth: 0 }}>
        <Text variant="title">{title}</Text>
        {subtitle ? (
          <Text variant="body" muted style={{ marginTop: 6, maxWidth: 300 }}>
            {subtitle}
          </Text>
        ) : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={onAction}
          style={{
            border: 0,
            background: 'var(--c-white)',
            color: 'var(--accent)',
            borderRadius: 999,
            height: 34,
            padding: '0 13px',
            fontSize: 12,
            fontWeight: 900,
            boxShadow: 'inset 0 0 0 1px var(--c-accent-border)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

function DeliveryMomentTile({ recipient, product, onProduct }) {
  return (
    <Surface
      variant="default"
      style={{
        width: RAIL_CARD_WIDTH,
        height: RAIL_CARD_HEIGHT,
        flex: `0 0 ${RAIL_CARD_WIDTH}px`,
        padding: 0,
        overflow: 'hidden',
        cursor: product ? 'pointer' : 'default',
        background: 'var(--c-text)',
        color: 'var(--c-white)',
        position: 'relative',
      }}
      onClick={product ? () => onProduct(product.id) : undefined}
      role={product ? 'button' : undefined}
      tabIndex={product ? 0 : undefined}
      onKeyDown={
        product
          ? (e) => {
              if (e.key === 'Enter') onProduct(product.id);
            }
          : undefined
      }
    >
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <video
          src={MOMENT_VIDEO}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-label={`${recipient.name} flower delivery preview`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: 'var(--c-text)' }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.08) 42%, rgba(0,0,0,0.34))',
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            height: 27,
            borderRadius: 999,
            padding: '0 10px',
            background: 'rgba(255,255,255,0.34)',
            color: 'var(--c-white)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            fontWeight: 1000,
          }}
        >
          <Heart size={13} fill="currentColor" />
          video
        </span>
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 50,
            height: 50,
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.42)',
            background: 'rgba(255,255,255,0.42)',
            color: 'var(--c-white)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Play size={20} fill="currentColor" style={{ marginLeft: 3 }} />
        </span>

        <div
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            bottom: 10,
            padding: 10,
            borderRadius: 18,
            background: 'rgba(0,0,0,0.14)',
            border: '1px solid rgba(255,255,255,0.18)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <Text variant="subtitle" style={{ color: 'rgba(255,255,255,0.92)' }}>
            Превью доставки
          </Text>
          <Text variant="caption" style={{ marginTop: 5, color: 'rgba(255,255,255,0.68)', lineHeight: 1.3 }}>
            Посмотрите, как может приехать букет.
          </Text>
        </div>
      </div>
    </Surface>
  );
}

function ProductRail({ title, subtitle, products, onOpen, onAdd, onCatalog, leadingCard }) {
  if (!products.length) return null;

  return (
    <section style={{ marginTop: 34 }}>
      <FunnelHeader title={title} subtitle={subtitle} action="Все" onAction={onCatalog} />

      <div
        style={{
          marginTop: 10,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 28,
          padding: '0 10px',
          borderRadius: 999,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--muted)',
          fontSize: 12,
          fontWeight: 850,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <MoveHorizontal size={14} />
        Листайте подборку
      </div>

      <div
        className="hide-scrollbar"
        style={{
          marginTop: 10,
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 4,
        }}
      >
        {leadingCard}
        {products.map((p) => (
          <div key={p.id} style={{ width: RAIL_CARD_WIDTH, height: RAIL_CARD_HEIGHT, flex: `0 0 ${RAIL_CARD_WIDTH}px` }}>
            <ProductCard
              id={p.id}
              title={p.title}
              subtitle={p.subtitle}
              price={p.price}
              image={p.image}
              images={p.images}
              onOpen={() => onOpen(p.id)}
              onAdd={() => onAdd(p.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function FlowerPassCard() {
  return (
    <Surface
      variant="default"
      style={{
        marginTop: 34,
        padding: 18,
        borderRadius: 'var(--r-xl)',
        border: '1px solid var(--border)',
        background:
          'radial-gradient(circle at 90% 10%, rgba(198,83,109,0.22), transparent 34%), linear-gradient(135deg, rgba(13,13,13,0.96), rgba(48,34,38,0.96))',
        color: 'var(--c-white)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.68)', marginBottom: 6, textTransform: 'uppercase' }}>
            FLOWIE Plus
          </Text>
          <Text variant="title">Цветочный план FLOWIE</Text>
          <Text variant="body" style={{ marginTop: 6, color: 'rgba(255,255,255,0.72)' }}>
            Планируйте регулярные цветы с понятным бюджетом и доставкой под контролем менеджера.
          </Text>
        </div>
        <span
          style={{
            width: 48,
            height: 48,
            borderRadius: 999,
            background: 'var(--c-white)',
            color: 'var(--accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Sparkles size={22} />
        </span>
      </div>

      <div style={{ marginTop: 15, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div
          style={{
            padding: 12,
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.08)',
          }}
        >
          <Text variant="subtitle">4 000 ₽+</Text>
          <Text variant="caption" style={{ marginTop: 4, color: 'rgba(255,255,255,0.62)' }}>
            в месяц
          </Text>
        </div>
        <div
          style={{
            padding: 12,
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.08)',
          }}
        >
          <Text variant="subtitle">Гибко</Text>
          <Text variant="caption" style={{ marginTop: 4, color: 'rgba(255,255,255,0.62)' }}>
            окна доставки
          </Text>
        </div>
      </div>

      <button
        type="button"
        disabled
        style={{
          marginTop: 14,
          width: '100%',
          height: 48,
          border: 0,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.72)',
          color: 'rgba(13,13,13,0.62)',
          fontWeight: 1000,
          cursor: 'default',
        }}
      >
        Скоро
      </button>
    </Surface>
  );
}

function SafetySummary() {
  return (
    <Surface
      variant="default"
      style={{
        marginTop: 26,
        padding: 16,
        borderRadius: 'var(--r-xl)',
        border: '1px solid var(--border)',
        display: 'grid',
        gap: 14,
      }}
    >
      <SafetyRow
        icon={Flower2}
        title="Свежие букеты"
        text="У каждого товара есть фото, цена и понятный сценарий доставки."
      />
      <SafetyRow
        icon={ShieldCheck}
        title="Прозрачная оплата"
        text="Вы оплачиваете конкретный букет, а не расплывчатую заявку."
      />
      <SafetyRow
        icon={Truck}
        title="Курьерская доставка"
        text="Детали доставки ведут менеджер FLOWIE и курьер."
      />
    </Surface>
  );
}

function specialPickScore(product) {
  const title = String(product?.title || product?.name || '').toLowerCase();
  if (title.includes('coral peonies with eucalyptus')) return -2;
  if (title.includes('peonies')) return -1;
  return 0;
}

export function RecipientProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { state, actions } = useAppState();

  const id = Number(params.id);
  const recipient = useMemo(
    () => normalizePublicRecipient(state.recipients.items.find((r) => Number(r.id) === id) || null, id),
    [id, state.recipients.items]
  );

  const flowerPicks = useMemo(() => (state.products.items || []).slice(0, 14), [state.products.items]);
  const easyPicks = useMemo(() => flowerPicks.filter((p) => Number(p.price) <= 60).slice(0, 6), [flowerPicks]);
  const specialPicks = useMemo(
    () => flowerPicks
      .filter((p) => Number(p.price) > 60 && Number(p.price) <= 95)
      .map((p, index) => ({ p, index }))
      .sort((a, b) => specialPickScore(a.p) - specialPickScore(b.p) || a.index - b.index)
      .map(({ p }) => p)
      .slice(0, 6),
    [flowerPicks]
  );
  const premiumPicks = useMemo(() => flowerPicks.filter((p) => Number(p.price) > 95).slice(0, 6), [flowerPicks]);

  if (!Number.isFinite(id) || !recipient) {
    const isReferralPlaceholder = Number(id) === 2 || Number(id) === 2002;
    return (
      <AppShell style={{ display: 'flex', flexDirection: 'column', '--app-content-inset-bottom': '0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Text variant="title">Адрес доставки</Text>
        </div>

        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <Surface
            variant="soft"
            style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', textAlign: 'center' }}
          >
            <Text variant="subtitle">{isReferralPlaceholder ? 'Открываем адрес...' : 'Адрес не найден'}</Text>
          </Surface>
        </div>
      </AppShell>
    );
  }

  const handle = String(recipient.handle || `@${String(recipient.name || 'address').toLowerCase().replace(/\s+/g, '')}`).replace(/^@?/, '@');
  const openProduct = (productId) => navigate(`/product/${productId}`);
  const addProduct = (productId) => actions.addToCart(productId, 1);
  const openCatalog = () => navigate('/catalog');
  const goBack = () => {
    const fromReferral = Boolean(location.state?.fromReferral);
    const hasAppHistory = Number(window.history?.length || 0) > 1;
    if (fromReferral || !hasAppHistory) {
      navigate('/', { replace: true });
      return;
    }
    navigate(-1);
  };

  return (
    <AppShell style={{ '--app-content-inset-bottom': '0px', '--app-shell-extra-bottom': '76px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <IconButton
          onClick={goBack}
          aria-label="Назад"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <ChevronLeft size={20} />
        </IconButton>
        <Text variant="subtitle">{handle}</Text>
        <span style={{ width: 36 }} />
      </div>

      <section style={{ marginTop: 20, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', position: 'relative' }}>
          <AppImage
            src={recipient.image}
            alt={recipient.name}
            fallback={FALLBACK_IMAGE}
            style={{
              width: 118,
              height: 118,
              borderRadius: 999,
              objectFit: 'cover',
              border: '5px solid var(--surface)',
              boxShadow: '0 18px 48px rgba(13,13,13,0.17)',
            }}
          />
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 7 }}>
          <Text variant="title">{recipient.name}</Text>
          <span
            title="Проверенный контакт"
            style={{
              width: 23,
              height: 23,
              borderRadius: 999,
              background: 'var(--c-white)',
              color: 'var(--accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 0 0 1px var(--c-accent-border)',
              flexShrink: 0,
            }}
          >
            <BadgeCheck size={15} strokeWidth={3} />
          </span>
        </div>

        <Text
          variant="body"
          muted
          style={{ marginTop: 8, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.42 }}
        >
          Сохранённый контакт для доставки цветов. Выберите букет и подтвердите время при оформлении.
        </Text>

        <div
          style={{
            marginTop: 16,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            height: 36,
            padding: '0 14px',
            borderRadius: 999,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Text variant="caption" style={{ color: 'var(--accent)' }}>
            {flowerPicks.length} букетов
          </Text>
          <span style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--c-ink-25)' }} />
          <Text variant="caption" muted>
            быстрое оформление
          </Text>
        </div>
      </section>

      <Surface
        variant="default"
        style={{
          marginTop: 28,
          padding: 16,
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border)',
          background: 'linear-gradient(135deg, rgba(198,83,109,0.12), rgba(255,255,255,0.96))',
        }}
      >
        <Text variant="title">Подборки для быстрого выбора</Text>
        <Text variant="body" muted style={{ marginTop: 6 }}>
          Мы сгруппировали букеты по случаю, чтобы не тратить время на догадки.
        </Text>
      </Surface>

      <ProductRail
        title="Лёгкий выбор"
        subtitle="Нежные букеты на каждый день без долгих сомнений."
        products={easyPicks}
        onOpen={openProduct}
        onAdd={addProduct}
        onCatalog={openCatalog}
        leadingCard={<DeliveryMomentTile recipient={recipient} product={flowerPicks[0]} onProduct={openProduct} />}
      />

      <ProductRail
        title="Особый момент"
        subtitle="Букеты выразительнее, когда хочется добавить эмоций."
        products={specialPicks}
        onOpen={openProduct}
        onAdd={addProduct}
        onCatalog={openCatalog}
      />

      <FlowerPassCard />

      <ProductRail
        title="Большой жест"
        subtitle="Для дней рождения, важных дат и моментов, где цветы должны звучать серьёзно."
        products={premiumPicks}
        onOpen={openProduct}
        onAdd={addProduct}
        onCatalog={openCatalog}
      />

      <SafetySummary />

      <details style={{ marginTop: 26 }}>
        <summary
          style={{
            listStyle: 'none',
            cursor: 'pointer',
          }}
        >
          <Surface
            variant="soft"
            style={{
              padding: 14,
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <Text variant="subtitle">Заказы для {recipient.name}</Text>
              <Text variant="caption" muted style={{ marginTop: 4 }}>
                Скрыто из публичного блока, доступно только этому покупателю.
              </Text>
            </div>
            <Text variant="caption" style={{ color: 'var(--accent)', flexShrink: 0 }}>
              View
            </Text>
          </Surface>
        </summary>
        <div style={{ marginTop: 10 }}>
          <OrderHistoryList recipientName={recipient.name} limit={5} emptyText={`Заказов для ${recipient.name} пока нет.`} />
        </div>
      </details>
    </AppShell>
  );
}
