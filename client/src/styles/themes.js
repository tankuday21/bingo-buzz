import { keyframes } from '@emotion/react';

const twinkle = keyframes`
  0% { opacity: 0.3; }
  50% { opacity: 1; }
  100% { opacity: 0.3; }
`;

export const themes = {
  default: {
    name: "Classic Light",
    colors: {
      primary: "#4F46E5",
      accent: "#3B82F6",
      success: "#10B981",
      background: "#F3F4F6",
      card: "#FFFFFF",
      text: "#1F2937",
      border: "#E5E7EB"
    },
    effects: {
      cardShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
      glassMorphism: "rgba(255, 255, 255, 0.8)",
      borderRadius: "1rem",
      transition: "all 0.3s ease",
      hover: "transform: scale(1.02)",
      active: "transform: scale(0.98)"
    }
  },
  neon: {
    name: "Neon Nights",
    colors: {
      primary: "#FF00FF",
      accent: "#00FFFF",
      success: "#39FF14",
      background: "#0D0D0D",
      card: "rgba(20, 20, 20, 0.8)",
      text: "#FFFFFF",
      border: "#FF00FF"
    },
    effects: {
      cardShadow: "0 0 15px rgba(255, 0, 255, 0.5), 0 0 30px rgba(255, 0, 255, 0.3)",
      glassMorphism: "rgba(20, 20, 20, 0.6)",
      borderRadius: "0.5rem",
      glow: "0 0 10px currentColor",
      neonText: "0 0 5px currentColor, 0 0 10px currentColor, 0 0 20px currentColor",
      borderGlow: "0 0 5px #FF00FF, 0 0 10px #FF00FF",
      hover: "transform: scale(1.05); filter: brightness(1.2)",
      active: "transform: scale(0.95); filter: brightness(0.8)"
    }
  },
  retro: {
    name: 'Retro',
    colors: {
      primary: {
        50: '#fef3c7',
        100: '#fde68a',
        500: '#f59e0b',
        600: '#d97706',
        700: '#b45309'
      },
      accent: {
        50: '#fdf2f8',
        100: '#fce7f3',
        500: '#ec4899',
        600: '#db2777',
        700: '#be185d'
      },
      success: {
        50: '#f0fdf4',
        100: '#dcfce7',
        500: '#22c55e',
        600: '#16a34a',
        700: '#15803d'
      },
      background: '#fffbeb',
      card: '#fef3c7',
      text: '#78350f',
      border: '#d97706'
    },
    effects: {
      cardShadow: '4px 4px 0 #92400e',
      borderRadius: '0.25rem',
      texture: 'background-image: url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23d97706\' fill-opacity=\'0.1\' fill-rule=\'evenodd\'%3E%3Cpath d=\'M5 0h1L0 6V5zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")'
    }
  },
  cartoon: {
    name: 'Cartoon',
    colors: {
      primary: {
        50: '#faf5ff',
        100: '#f3e8ff',
        500: '#a855f7',
        600: '#9333ea',
        700: '#7e22ce'
      },
      accent: {
        50: '#fdf2f8',
        100: '#fce7f3',
        500: '#ec4899',
        600: '#db2777',
        700: '#be185d'
      },
      success: {
        50: '#f0fdf4',
        100: '#dcfce7',
        500: '#22c55e',
        600: '#16a34a',
        700: '#15803d'
      },
      background: '#faf5ff',
      card: 'white',
      text: '#6b21a8',
      border: '#d8b4fe'
    },
    effects: {
      cardShadow: '0 4px 0 #c084fc',
      borderRadius: '1rem',
      border: '3px solid #d8b4fe'
    }
  },
  galaxy: {
    name: "Cosmic Galaxy",
    colors: {
      primary: "#8B5CF6",
      accent: "#6366F1",
      success: "#34D399",
      background: "#0F172A",
      card: "rgba(30, 41, 59, 0.8)",
      text: "#F8FAFC",
      border: "#4F46E5"
    },
    effects: {
      cardShadow: "0 0 20px rgba(139, 92, 246, 0.3), 0 0 40px rgba(99, 102, 241, 0.2)",
      glassMorphism: "rgba(30, 41, 59, 0.6)",
      borderRadius: "1rem",
      stars: `
        radial-gradient(1px 1px at 20px 30px, white, rgba(0,0,0,0)),
        radial-gradient(1px 1px at 40px 70px, white, rgba(0,0,0,0)),
        radial-gradient(1px 1px at 50px 160px, white, rgba(0,0,0,0)),
        radial-gradient(1px 1px at 90px 40px, white, rgba(0,0,0,0)),
        radial-gradient(1px 1px at 130px 80px, white, rgba(0,0,0,0)),
        radial-gradient(1px 1px at 160px 120px, white, rgba(0,0,0,0))
      `,
      starAnimation: `${twinkle} 3s infinite`,
      nebula: "linear-gradient(45deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.2))",
      hover: "transform: scale(1.03); filter: brightness(1.1)",
      active: "transform: scale(0.97); filter: brightness(0.9)"
    }
  },
  midnight: {
    name: "Midnight Dreams",
    colors: {
      primary: "#4F46E5",
      accent: "#818CF8",
      success: "#34D399",
      background: "#1E1B4B",
      card: "rgba(30, 27, 75, 0.9)",
      text: "#E0E7FF",
      border: "#6366F1"
    },
    effects: {
      cardShadow: "0 0 20px rgba(99, 102, 241, 0.2)",
      glassMorphism: "rgba(30, 27, 75, 0.7)",
      borderRadius: "1rem",
      moonGlow: "0 0 20px rgba(224, 231, 255, 0.2)",
      nightSky: "radial-gradient(circle at top right, #4F46E5, transparent)",
      hover: "transform: scale(1.03); filter: brightness(1.1)",
      active: "transform: scale(0.97); filter: brightness(0.9)"
    }
  },
  crystal: {
    name: "Crystal Clear",
    colors: {
      primary: "#7DD3FC",
      accent: "#38BDF8",
      success: "#34D399",
      background: "#EFF6FF",
      card: "rgba(255, 255, 255, 0.7)",
      text: "#1E3A8A",
      border: "#93C5FD"
    },
    effects: {
      cardShadow: "0 0 15px rgba(147, 197, 253, 0.3), 0 0 30px rgba(147, 197, 253, 0.2)",
      glassMorphism: "rgba(255, 255, 255, 0.5)",
      borderRadius: "1.5rem",
      prism: "linear-gradient(135deg, rgba(125, 211, 252, 0.2), rgba(56, 189, 248, 0.2))",
      shimmer: "linear-gradient(45deg, transparent 0%, rgba(255, 255, 255, 0.4) 50%, transparent 100%)",
      hover: "transform: scale(1.02); backdrop-filter: blur(12px)",
      active: "transform: scale(0.98); backdrop-filter: blur(8px)"
    }
  },
  festive: {
    name: 'Festive',
    colors: {
      primary: {
        50: '#fef2f2',
        100: '#fee2e2',
        500: '#ef4444',
        600: '#dc2626',
        700: '#b91c1c'
      },
      accent: {
        50: '#f0fdf4',
        100: '#dcfce7',
        500: '#22c55e',
        600: '#16a34a',
        700: '#15803d'
      },
      success: {
        50: '#f0fdf4',
        100: '#dcfce7',
        500: '#22c55e',
        600: '#16a34a',
        700: '#15803d'
      },
      background: '#fff1f2',
      card: 'white',
      text: '#881337',
      border: '#fecdd3'
    },
    effects: {
      cardShadow: '0 4px 6px -1px rgba(136, 19, 55, 0.1)',
      borderRadius: '0.75rem',
      border: '2px solid #fecdd3',
      festive: 'background-image: url("data:image/svg+xml,%3Csvg width=\'12\' height=\'12\' viewBox=\'0 0 12 12\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M6 0l3 6-3 6-3-6z\' fill=\'%23fecdd3\' fill-opacity=\'0.4\'/%3E%3C/svg%3E")'
    }
  }
}; 