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
  const start = getEdgePoint(box1, box2, paper);
  const end = getEdgePoint(box2, box1, paper);
  const arrowSize = 8;
  const direction = end.subtract(start).normalize();
  const perpendicular = new paper.Point(-direction.y, direction.x);
  const arrowBase = end.subtract(direction.multiply(arrowSize));
  const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize/2));
  const arrowRight = arrowBase.subtract(perpendicular.multiply(arrowSize/2));
  const handle1 = new paper.Point((start.x + arrowBase.x) / 2, start.y);
  const handle2 = new paper.Point((start.x + arrowBase.x) / 2, arrowBase.y);
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
    nameLabel = new paper.PointText({
      point: midPoint.add(new paper.Point(0, -10)),
      content: connectionData.name,
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