import React, { useEffect } from "react";

const ParticlesBackground = () => {
  useEffect(() => {
    const container = document.getElementById("particles");
    if (!container) return;

    // Clear existing particles on re-mount (hot reload, route change, etc.)
    container.innerHTML = "";

    const particleCount = 30;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement("div");
      particle.classList.add("particle");

      // Random size between 5 and 15px
      const size = Math.random() * 10 + 5;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;

      // Random initial position
      particle.style.left = `${Math.random() * 100}vw`;
      particle.style.top = `${Math.random() * 100}vh`;

      // Random animation delay
      particle.style.animationDelay = `${Math.random() * 15}s`;

      container.appendChild(particle);
    }
  }, []);

  return (
    <>
      <div className="background-glow" />
      <div className="particles-container" id="particles" />
    </>
  );
};

export default ParticlesBackground;
