import React from 'react';

interface SimpleChartProps {
  data: number[];
}

const SimpleChart: React.FC<SimpleChartProps> = ({ data }) => {
  const max = Math.max(...data, 1); // Ensure max is at least 1
  const normalized = data.map(v => (v / max) * 100);

  return (
    <div className="simple-chart">
      {normalized.map((height, i) => (
        <div 
          key={i} 
          className="bar" 
          style={{ height: `${height}%` }}
          title={`${data[i]} TWIST`}
        />
      ))}
    </div>
  );
};

export default SimpleChart;