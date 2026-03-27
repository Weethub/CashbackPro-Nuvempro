export default function StatCard({ title, value, subtitle, icon: Icon, iconColor = 'text-blue-500', borderColor = 'border-blue-500' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${borderColor} p-5`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value ?? '—'}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-lg bg-gray-50 ${iconColor}`}>
            <Icon size={22} />
          </div>
        )}
      </div>
    </div>
  );
}
