'use client'

interface Props {
  categories: any[]
  selected: string | null
  onSelect: (id: string | null) => void
}

export default function CategoryFilter({ categories, selected, onSelect }: Props) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2 flex gap-2 overflow-x-auto">
      <button
        onClick={() => onSelect(null)}
        className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
          selected === null
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        All
      </button>
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            selected === cat.id
              ? 'text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          style={selected === cat.id ? { backgroundColor: cat.color } : {}}
        >
          {cat.name}
        </button>
      ))}
    </div>
  )
}
