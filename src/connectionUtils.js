// Utility functions for connections

export const getEdgePoint = (fromBox, toBox, paper) => {
  const fromCenter = fromBox.bounds.center;
  const toCenter = toBox.bounds.center;
  const direction = toCenter.subtract(fromCenter).normalize();
  const toBounds = toBox.bounds;
  const halfWidth = toBounds.width / 2;
  const halfHeight = toBounds.height / 2;
  const absX = Math.abs(direction.x);
  const absY = Math.abs(direction.y);
  let edgePoint;
  if (absX / halfWidth > absY / halfHeight) {
    const x = toCenter.x + (direction.x > 0 ? -halfWidth : halfWidth);
    const y = toCenter.y - (direction.y * halfWidth / absX);
    edgePoint = new paper.Point(x, y);
  } else {
    const x = toCenter.x - (direction.x * halfHeight / absY);
    const y = toCenter.y + (direction.y > 0 ? -halfHeight : halfHeight);
    edgePoint = new paper.Point(x, y);
  }
  return edgePoint;
};

export const createConnection = (box1, box2, connectionData, paper, getEdgePoint) => {
  const end = getEdgePoint(box1, box2, paper);
  const start = getEdgePoint(box2, box1, paper);
  const arrowSize = 8;
  // Snap direction to nearest axis (horizontal or vertical only)
  const rawDirection = end.subtract(start);
  let direction;
  if (Math.abs(rawDirection.x) > Math.abs(rawDirection.y)) {
    // Horizontal direction
    direction = new paper.Point(rawDirection.x > 0 ? 1 : -1, 0);
  } else {
    // Vertical direction
    direction = new paper.Point(0, rawDirection.y > 0 ? 1 : -1);
  }
  const perpendicular = new paper.Point(-direction.y, direction.x);
  const arrowBase = end.subtract(direction.multiply(arrowSize));
  const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize/2));
  const arrowRight = arrowBase.subtract(perpendicular.multiply(arrowSize/2));
  // Handle calculations should follow the arrow direction
  let handle1, handle2;
  if (Math.abs(direction.x) > 0) {
    // Horizontal arrow - curve should be vertical
    handle1 = new paper.Point((start.x + arrowBase.x) / 2, start.y);
    handle2 = new paper.Point((start.x + arrowBase.x) / 2, arrowBase.y);
  } else {
    // Vertical arrow - curve should be horizontal
    handle1 = new paper.Point(start.x, (start.y + arrowBase.y) / 2);
    handle2 = new paper.Point(arrowBase.x, (start.y + arrowBase.y) / 2);
  }
  const path = new paper.Path({
    segments: [new paper.Segment(start), new paper.Segment(arrowBase)],
    strokeColor: 'black',
    strokeWidth: 2
  });
  path.segments[0].handleOut = handle1.subtract(start);
  path.segments[1].handleIn = handle2.subtract(arrowBase);
  const arrowTip = end;
  const arrowHead = new paper.Path({
    segments: [arrowTip, arrowLeft, arrowRight],
    strokeColor: 'black',
    strokeWidth: 2,
    fillColor: 'black',
    closed: true
  });
  let nameLabel = null;
  if (connectionData && connectionData.name) {
    const midPoint = start.add(arrowBase).divide(2);
    
    // Create display text with amounts
    const deductAmount = connectionData.deductAmount !== undefined ? Number(connectionData.deductAmount) : 1;
    const transferAmount = connectionData.transferAmount !== undefined ? Number(connectionData.transferAmount) : 1;
    
    // Always display both amounts
     const displayText = `${connectionData.name} (-${deductAmount}/+${transferAmount})`;
    
    nameLabel = new paper.PointText({
      point: midPoint.add(new paper.Point(0, -10)),
      content: displayText,
      fillColor: 'black',
      fontSize: 12,
      justification: 'center'
    });
  }
  const connectionGroup = nameLabel ?
    new paper.Group([path, arrowHead, nameLabel]) :
    new paper.Group([path, arrowHead]);
  if (connectionData) {
    connectionGroup.connectionData = connectionData;
  }
  return connectionGroup;
};