import { BottomSheet } from './ui/BottomSheet';
import { PhoneLogin } from './PhoneLogin';

export function BottomLoginSheet({ open, initialPhone, onClose, onSuccess }) {
  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="Вход по телефону">
      <div style={{ minHeight: 0, paddingBottom: 8 }}>
        <PhoneLogin initialPhone={initialPhone} onCancel={onClose} onSuccess={onSuccess} />
      </div>
    </BottomSheet>
  );
}
