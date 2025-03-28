import React, { useEffect, useState } from 'react';

const Timer = ({ seconds }) => {
  const [progress, setProgress] = useState(100);
  
  useEffect(() => {
    const percentage = (seconds / 15) * 100;
    setProgress(percentage);
  }, [seconds]);
  
  return (
    <div className="w-full">
      <div className="flex justify-between mb-1 text-sm">
        <span>Time remaining:</span>
        <span className={`font-bold ${seconds <= 5 ? 'text-red-500' : ''}`}>
          {seconds}s
        </span>
      </div>
      <div className="timer-bar">
        <div 
          className="timer-progress"
          style={{ 
            width: `${progress}%`,
            backgroundColor: seconds <= 5 ? 'var(--secondary-color)' : 'var(--primary-color)',
            transition: 'width 1s linear, background-color 0.5s ease'
          }}
        ></div>
      </div>
    </div>
  );
};

export default Timer;
