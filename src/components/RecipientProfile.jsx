import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BadgeCheck,
  ChevronLeft,
  Gift,
  Heart,
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
const VIVIENNE_AVATAR = '/vivienne-avatar.jpeg';
const VIVIENNE_HANDLE = '@_v.morel';
const PUBLIC_PROFILES = {
  2: {
    id: 2,
    name: 'Vivienne',
    handle: VIVIENNE_HANDLE,
    relation: 'Verified wishlist',
    image: VIVIENNE_AVATAR,
  },
  2002: {
    id: 2002,
    name: 'Vivienne',
    handle: VIVIENNE_HANDLE,
    relation: 'Verified wishlist',
    image: VIVIENNE_AVATAR,
  },
};
const MOMENT_IMAGE =
  'https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=900&q=82';
const MOMENT_VIDEO = '/videos/vivienne-reaction.mp4';
const RAIL_CARD_WIDTH = 188;
const RAIL_CARD_HEIGHT = 334;

function normalizePublicRecipient(recipient, id) {
  if (!recipient) return null;
  const looksLikeVivienne =
    Number(id) === 2 ||
    Number(id) === 2002 ||
    String(recipient?.name || '').trim().toLowerCase() === 'vivienne';

  if (!looksLikeVivienne) return recipient;
  return {
    ...recipient,
    id: recipient.id ?? id,
    name: 'Vivienne',
    handle: VIVIENNE_HANDLE,
    image: VIVIENNE_AVATAR,
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

function CreatorMomentTile({ recipient, gift, onGift }) {
  return (
    <Surface
      variant="default"
      style={{
        width: RAIL_CARD_WIDTH,
        height: RAIL_CARD_HEIGHT,
        flex: `0 0 ${RAIL_CARD_WIDTH}px`,
        padding: 0,
        overflow: 'hidden',
        cursor: gift ? 'pointer' : 'default',
        background: 'var(--c-text)',
        color: 'var(--c-white)',
        position: 'relative',
      }}
      onClick={gift ? () => onGift(gift.id) : undefined}
      role={gift ? 'button' : undefined}
      tabIndex={gift ? 0 : undefined}
      onKeyDown={
        gift
          ? (e) => {
              if (e.key === 'Enter') onGift(gift.id);
            }
          : undefined
      }
    >
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <video
          src={MOMENT_VIDEO}
          poster={MOMENT_IMAGE}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-label={`${recipient.name} gift reaction`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
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
            Watch her reaction
          </Text>
          <Text variant="caption" style={{ marginTop: 5, color: 'rgba(255,255,255,0.68)', lineHeight: 1.3 }}>
            See what this could feel like.
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
      <FunnelHeader title={title} subtitle={subtitle} action="See all" onAction={onCatalog} />

      <div
        className="hide-scrollbar"
        style={{
          marginTop: 14,
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
              onOpen={() => onOpen(p.id)}
              onAdd={() => onAdd(p.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function FlowerPassCard({ onClick }) {
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
            FLOWIE Pass
          </Text>
          <Text variant="title">FLOWIE flower pass</Text>
          <Text variant="body" style={{ marginTop: 6, color: 'rgba(255,255,255,0.72)' }}>
            Send flowers regularly without asking for details. You set the budget; she accepts each drop when it suits her.
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
          <Text variant="subtitle">$49+</Text>
          <Text variant="caption" style={{ marginTop: 4, color: 'rgba(255,255,255,0.62)' }}>
            per month
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
          <Text variant="subtitle">Her pace</Text>
          <Text variant="caption" style={{ marginTop: 4, color: 'rgba(255,255,255,0.62)' }}>
            recipient-approved
          </Text>
        </div>
      </div>

      <button
        type="button"
        onClick={onClick}
        style={{
          marginTop: 14,
          width: '100%',
          height: 48,
          border: 0,
          borderRadius: 999,
          background: 'var(--c-white)',
          color: 'var(--c-text)',
          fontWeight: 1000,
          cursor: 'pointer',
        }}
      >
        Set up FLOWIE Pass
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
        icon={Gift}
        title="Approved picks only"
        text="Every item here is something she chose in advance."
      />
      <SafetyRow
        icon={ShieldCheck}
        title="No blind transfers"
        text="You pay for a clear item with a visible price."
      />
      <SafetyRow
        icon={Truck}
        title="Address stays hidden"
        text="Delivery details are handled on the recipient side."
      />
    </Surface>
  );
}

export function RecipientProfile() {
  const navigate = useNavigate();
  const params = useParams();
  const { state, actions } = useAppState();

  const id = Number(params.id);
  const recipient = useMemo(
    () => normalizePublicRecipient(state.recipients.items.find((r) => Number(r.id) === id) || PUBLIC_PROFILES[id] || null, id),
    [id, state.recipients.items]
  );

  const wishlist = useMemo(() => (state.products.items || []).slice(0, 14), [state.products.items]);
  const easyPicks = useMemo(() => wishlist.filter((p) => Number(p.price) <= 60).slice(0, 6), [wishlist]);
  const specialPicks = useMemo(
    () => wishlist.filter((p) => Number(p.price) > 60 && Number(p.price) <= 95).slice(0, 6),
    [wishlist]
  );
  const premiumPicks = useMemo(() => wishlist.filter((p) => Number(p.price) > 95).slice(0, 6), [wishlist]);

  if (!Number.isFinite(id) || !recipient) {
    return (
      <AppShell style={{ display: 'flex', flexDirection: 'column', '--app-content-inset-bottom': '0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Text variant="title">Wishlist profile</Text>
        </div>

        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <Surface
            variant="soft"
            style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', textAlign: 'center' }}
          >
            <Text variant="subtitle">Profile not found</Text>
          </Surface>
        </div>
      </AppShell>
    );
  }

  const handle = String(recipient.handle || `@${String(recipient.name || 'creator').toLowerCase().replace(/\s+/g, '')}`).replace(/^@?/, '@');
  const openProduct = (productId) => navigate(`/product/${productId}`);
  const addProduct = (productId) => actions.addToCart(productId, 1);
  const openCatalog = () => navigate('/catalog');

  return (
    <AppShell style={{ '--app-content-inset-bottom': '0px', '--app-shell-extra-bottom': '76px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <IconButton
          onClick={() => navigate(-1)}
          aria-label="Back"
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
            title="Verified account"
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
          Verified profile for private gifting. Pick from approved items; no address needed.
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
            {wishlist.length} approved picks
          </Text>
          <span style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--c-ink-25)' }} />
          <Text variant="caption" muted>
            safe checkout
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
        <Text variant="title">Sorted for easier choosing</Text>
        <Text variant="body" muted style={{ marginTop: 6 }}>
          We grouped {recipient.name}'s picks by intent, so you can move fast without guessing.
        </Text>
      </Surface>

      <ProductRail
        title="Easy yes"
        subtitle="Simple gifts that feel thoughtful without making the decision heavy."
        products={easyPicks}
        onOpen={openProduct}
        onAdd={addProduct}
        onCatalog={openCatalog}
        leadingCard={<CreatorMomentTile recipient={recipient} gift={wishlist[0]} onGift={openProduct} />}
      />

      <ProductRail
        title="Feels special"
        subtitle="A stronger gesture when you want the gift to land with more emotion."
        products={specialPicks}
        onOpen={openProduct}
        onAdd={addProduct}
        onCatalog={openCatalog}
      />

      <FlowerPassCard onClick={() => navigate('/catalog?collection=flowers')} />

      <ProductRail
        title="Big gesture"
        subtitle="For birthdays, milestones, or moments where you want it to feel serious."
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
              <Text variant="subtitle">Orders with {recipient.name}</Text>
              <Text variant="caption" muted style={{ marginTop: 4 }}>
                Hidden from the public pitch, available for this buyer.
              </Text>
            </div>
            <Text variant="caption" style={{ color: 'var(--accent)', flexShrink: 0 }}>
              View
            </Text>
          </Surface>
        </summary>
        <div style={{ marginTop: 10 }}>
          <OrderHistoryList recipientName={recipient.name} limit={5} emptyText={`No orders with ${recipient.name} yet.`} />
        </div>
      </details>
    </AppShell>
  );
}
