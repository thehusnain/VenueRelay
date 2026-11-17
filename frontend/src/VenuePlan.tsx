/** A schematic of the sample event; labels correspond to its example tasks. */
export function VenuePlan() {
  return (
    <svg
      className="venue-plan"
      viewBox="0 0 480 172"
      role="img"
      aria-label="Sample venue plan: north entrance, main stage and food court connected by an accessible route"
    >
      <path
        d="M30 124H110Q128 124 128 106V63Q128 48 145 48H328Q345 48 345 65V115Q345 130 363 130H450"
        fill="none"
        stroke="#a6c8b8"
        strokeWidth="2"
        strokeDasharray="5 6"
      />
      <rect x="24" y="89" width="82" height="57" rx="10" fill="#d3e8dc" />
      <path d="M48 129v-24h34v24M65 105v24" fill="none" stroke="#185445" strokeWidth="2" />
      <rect x="181" y="21" width="110" height="70" rx="12" fill="#f4dba8" />
      <path d="M201 44h70M206 53h60M211 62h50" stroke="#725221" strokeWidth="2" />
      <rect x="367" y="67" width="88" height="44" rx="8" fill="#b8dad1" />
      <path d="M386 80v19m12-19v19m12-19v19m12-19v19m12-19v19" stroke="#185445" strokeWidth="2" />
      <circle cx="128" cy="100" r="8" fill="#f4dba8" stroke="#173f35" strokeWidth="3" />
      <circle cx="345" cy="94" r="8" fill="#d3e8dc" stroke="#173f35" strokeWidth="3" />
      <g fill="#e6f3ec" fontFamily="Manrope, sans-serif" fontSize="16" fontWeight="500">
        <text x="24" y="77">
          North entrance
        </text>
        <text x="206" y="112">
          Main stage
        </text>
        <text x="411" y="53" textAnchor="middle">
          Food court
        </text>
      </g>
      <path d="m187 146 4 4 8-9" stroke="#b8dad1" strokeWidth="2" fill="none" />
      <text x="207" y="151" fill="#b8dad1" fontFamily="Manrope, sans-serif" fontSize="14">
        Accessible route checked
      </text>
    </svg>
  );
}
