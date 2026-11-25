import { useLocation, useNavigate } from 'react-router-dom';
import { Heart, House, MapPin, ShoppingBag, User } from 'lucide-react';
import { bottomNavItems } from '../../lib/authUi';

const ICONS = {
  home: House,
  favorites: Heart,
  catalog: ShoppingBag,
  recipients: MapPin,
  account: User,
  login: User,
};

function Tab({ to, label, icon: Icon, onSelect, analyticsElement }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = Boolean(to) && (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));
  return (
    <button
      type="button"
      onClick={() => (to ? navigate(to) : onSelect?.())}
      className={isActive ? 'ui-bottomNavLink ui-bottomNavLink--active' : 'ui-bottomNavLink'}
      aria-current={isActive ? 'page' : undefined}
      aria-label={label}
      data-analytics-element={analyticsElement}
      data-analytics-placement="bottom_nav"
    >
      <Icon size={22} />
      <span className="ui-bottomNavLabel">{label}</span>
    </button>
  );
}

export function BottomNav({ user, onLogin }) {
  const items = bottomNavItems(user);
  const analyticsElements = {
    home: 'nav_home',
    catalog: 'nav_catalog',
    favorites: 'nav_favorites',
    recipients: 'nav_recipients',
    account: 'nav_account',
    login: 'nav_account',
  };
  return (
    <nav className="ui-bottomNav" aria-label="Навигация">
      <div className="ui-bottomNavInner">
        {items.map((item) => (
          <Tab
            key={item.key}
            to={item.to}
            label={item.label}
            icon={ICONS[item.key]}
            onSelect={item.key === 'login' ? onLogin : undefined}
            analyticsElement={analyticsElements[item.key]}
          />
        ))}
      </div>
    </nav>
  );
}
