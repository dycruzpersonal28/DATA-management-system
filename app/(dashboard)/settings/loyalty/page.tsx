'use client'

import { Heart } from 'lucide-react'

export default function LoyaltyPage() {
  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Loyalty</h2>
        <p className="text-sm text-gray-500 mt-1">Customer loyalty points program settings.</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 p-10 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 bg-pink-100 rounded-2xl flex items-center justify-center">
          <Heart className="w-7 h-7 text-pink-500" />
        </div>
        <p className="text-base font-semibold text-gray-800">Loyalty Program</p>
        <p className="text-sm text-gray-400 max-w-sm">
          Loyalty settings are managed through your shop configuration. Customer points are tracked automatically on each transaction.
        </p>
      </div>
    </div>
  )
}
