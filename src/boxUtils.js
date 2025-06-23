// Utility functions for box operations

export const addBox = (jsonData, paper) => {
  const maxId = Math.max(0, ...jsonData.boxes.map(b => b.id || 0));
  const newStock = {
    id: maxId + 1,
    name: `Stock ${maxId + 1}`,
    type: 'stock',
    position: {
      x: Math.round(Math.random() * (paper.view.size.width - 50)),
      y: Math.round(Math.random() * (paper.view.size.height - 50))
    }
  };
  return {
    ...jsonData,
    boxes: [...jsonData.boxes, newStock]
  };
};

export const removeBox = (jsonData) => {
  if (jsonData.boxes.length === 0) return jsonData;
  const boxes = jsonData.boxes.slice(0, -1);
  return {
    ...jsonData,
    boxes
  };
};