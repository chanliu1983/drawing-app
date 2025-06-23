// Utility functions for PaperCanvas

export const drawAxes = (paper) => {
  paper.project.getItems({ name: 'axis' }).forEach(item => item.remove());
  const origin = new paper.Point(50, paper.view.size.height - 50);
  const viewSize = paper.view.size;
  const xAxis = new paper.Path.Line(new paper.Point(0, origin.y), new paper.Point(viewSize.width, origin.y));
  xAxis.strokeColor = 'grey';
  xAxis.name = 'axis';
  const yAxis = new paper.Path.Line(new paper.Point(origin.x, 0), new paper.Point(origin.x, viewSize.height));
  yAxis.strokeColor = 'grey';
  yAxis.name = 'axis';
  const originText = new paper.PointText(origin.add(5, -10));
  originText.content = `(0,0)`;
  originText.fillColor = 'black';
  originText.fontSize = 12;
  originText.name = 'axis';
  const xLabel = new paper.PointText(new paper.Point(viewSize.width - 20, origin.y - 10));
  xLabel.content = 'x';
  xLabel.fillColor = 'grey';
  xLabel.name = 'axis';
  const yLabel = new paper.PointText(new paper.Point(origin.x + 10, 20));
  yLabel.content = 'y';
  yLabel.fillColor = 'grey';
  yLabel.name = 'axis';
};

export const updateConnectionsForResize = (paperState, getEdgePoint) => {
  paperState.current.connections.forEach((connection, index) => {
    if (index + 1 >= paperState.current.boxes.length) return;
    const box1 = paperState.current.boxes[index];
    const box2 = paperState.current.boxes[index + 1];
    const start = getEdgePoint(box2, box1);
    const end = getEdgePoint(box1, box2);
    const handle1 = new paper.Point((start.x + end.x) / 2, start.y);
    const handle2 = new paper.Point((start.x + end.x) / 2, end.y);
    const path = connection.children[0];
    if (path && path.segments && path.segments.length === 2) {
      path.segments[0].point = start;
      path.segments[1].point = end;
      path.segments[0].handleOut = handle1.subtract(start);
      path.segments[1].handleIn = handle2.subtract(end);
    }
    const arrowHead = connection.children[1];
    if (arrowHead && arrowHead.segments) {
      const arrowSize = 8;
      arrowHead.segments[0].point = new paper.Point(end.x - arrowSize, end.y - arrowSize/2);
      arrowHead.segments[1].point = new paper.Point(end.x, end.y);
      arrowHead.segments[2].point = new paper.Point(end.x - arrowSize, end.y + arrowSize/2);
    }
  });
};

export const resizeCanvas = (canvasRef, paperState, drawAxes, paper) => {
  if (!canvasRef.current || !canvasRef.current.parentElement) return;
  const canvasContainer = canvasRef.current.parentElement;
  const newWidth = canvasContainer.clientWidth;
  const newHeight = canvasContainer.clientHeight;
  const oldHeight = paperState.current.lastHeight;
  if (oldHeight !== null) {
    const deltaY = newHeight - oldHeight;
    if (deltaY !== 0) {
      paperState.current.boxes.forEach(box => {
        box.position.y += deltaY;
      });
    }
  }
  paperState.current.lastWidth = newWidth;
  paperState.current.lastHeight = newHeight;
  canvasRef.current.width = newWidth;
  canvasRef.current.height = newHeight;
  paper.view.setViewSize(new paper.Size(newWidth, newHeight));
  const pixelRatio = window.devicePixelRatio || 1;
  canvasRef.current.style.width = newWidth + 'px';
  canvasRef.current.style.height = newHeight + 'px';
  canvasRef.current.width = newWidth * pixelRatio;
  canvasRef.current.height = newHeight * pixelRatio;
  paper.view.setViewSize(new paper.Size(newWidth, newHeight));
  const ctx = canvasRef.current.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);
  updateConnectionsForResize(paperState, (a, b) => getEdgePoint(a, b));
  drawAxes(paper);
  paper.view.draw();
};