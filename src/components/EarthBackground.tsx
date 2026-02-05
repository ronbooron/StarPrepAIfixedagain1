import React from "react";

const EarthBackground: React.FC = () => {
  return (
    <>
      {/* Pure Black Space */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "#000000",
          zIndex: 0
        }}
      />
      
      {/* Real NASA Earth Image */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          backgroundImage: "url('https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=800')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          boxShadow: "inset -40px -40px 80px rgba(0,0,0,0.7), 0 0 100px rgba(37, 99, 235, 0.5)",
          zIndex: 2,
          opacity: 0.6,
          animation: "spin 100s linear infinite"
        }}
      />
      
      {/* Musical Notes - Translucent */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "fixed",
            fontSize: `${Math.random() * 18 + 14}px`,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            opacity: Math.random() * 0.15 + 0.05,
            animation: `float ${Math.random() * 10 + 15}s infinite ease-in-out`,
            zIndex: 1
          }}
        >
          {['🎵', '🎶', '🎼'][Math.floor(Math.random() * 3)]}
        </div>
      ))}
      
      <style>{`
        @keyframes spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        
        @keyframes float {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(20px, -30px) rotate(5deg); }
          50% { transform: translate(-15px, -60px) rotate(-5deg); }
          75% { transform: translate(25px, -30px) rotate(3deg); }
        }
      `}</style>
    </>
  );
};

export default EarthBackground;
