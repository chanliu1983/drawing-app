import React, { useEffect, useRef, useState } from 'react';
import paper from 'paper';

const PaperCanvas = () => {
  const canvasRef = useRef(null);
  const [boxes, setBoxes] = useState([]);
  const [connections, setConnections] = useState([]);

  useEffect(() => {
    if (!canvasRef.current) {
      console.error('Canvas ref is null');
      return;
    }

    paper.setup(canvasRef.current);

    const resizeCanvas = () => {
      if (!canvasRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;
      canvasRef.current.width = width * dpr;
      canvasRef.current.height = height * dpr;
      paper.view.viewSize = new paper.Size(width, height);
      paper.view.scale(dpr, dpr); // Ensure Paper.js drawing matches the device pixel ratio
      paper.view.draw();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      paper.project.clear();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  const addBox = () => {
    console.log('Adding box');
    const boxWidth = 50;
    const boxHeight = 50;
    // Ensure the box is fully within the view
    const minX = 0;
    const minY = 0;
    const maxX = paper.view.size.width - boxWidth;
    const maxY = paper.view.size.height - boxHeight;
    const x = Math.random() * (maxX - minX) + minX;
    const y = Math.random() * (maxY - minY) + minY;

    const newBox = new paper.Path.Rectangle({
      point: [x, y],
      size: [boxWidth, boxHeight],
      fillColor: 'blue'
    });

    let isDragging = false;
    let offset = new paper.Point();

    newBox.onMouseDown = (event) => {
      console.log('Box mouse down');
      isDragging = true;
      offset = newBox.position.subtract(event.point);
    };

    newBox.onMouseDrag = (event) => {
      if (isDragging) {
        console.log('Box dragging');
        newBox.position = event.point.add(offset);
        updateConnections();
      }
    };

    newBox.onMouseUp = () => {
      console.log('Box mouse up');
      isDragging = false;
    };

    setBoxes(prevBoxes => {
      const newBoxes = [...prevBoxes, newBox];
      console.log('New boxes:', newBoxes.length);
      updateConnectionsAfterBoxChange(newBoxes);
      return newBoxes;
    });

    paper.view.draw();
  };

  const removeBox = () => {
    console.log('Removing box');
    if (boxes.length > 0) {
      const lastBox = boxes[boxes.length - 1];
      lastBox.remove();
      setBoxes(prevBoxes => {
        const newBoxes = prevBoxes.slice(0, -1);
        console.log('Remaining boxes:', newBoxes.length);
        updateConnectionsAfterBoxChange(newBoxes);
        return newBoxes;
      });
      paper.view.draw();
    }
  };

  const createConnection = (box1, box2) => {
    console.log('Creating connection');
    const path = new paper.Path();
    path.strokeColor = 'black';
    path.strokeWidth = 2;

    const start = box1.bounds.center;
    const end = box2.bounds.center;
    const handle1 = new paper.Point((start.x + end.x) / 2, start.y);
    const handle2 = new paper.Point((start.x + end.x) / 2, end.y);

    path.moveTo(start);
    path.cubicCurveTo(handle1, handle2, end);

    return path;
  };

  const updateConnectionsAfterBoxChange = (newBoxes) => {
    console.log('Updating connections after box change');
    connections.forEach(conn => conn.remove());
    const newConnections = [];
    for (let i = 0; i < newBoxes.length - 1; i++) {
      const connection = createConnection(newBoxes[i], newBoxes[i + 1]);
      newConnections.push(connection);
    }
    setConnections(newConnections);
    console.log('New connections:', newConnections.length);
  };

  const updateConnections = () => {
    console.log('Updating connections');
    connections.forEach((connection, index) => {
      if (index + 1 >= boxes.length) {
        console.error('Connection index out of bounds');
        return;
      }
      // Ensure the connection path has at least 3 segments
      if (!connection.segments[0] || !connection.segments[1] || !connection.segments[2]) {
        console.error('Connection path does not have enough segments');
        return;
      }
      const box1 = boxes[index];
      const box2 = boxes[index + 1];
      const start = box1.bounds.center;
      const end = box2.bounds.center;
      const handle1 = new paper.Point((start.x + end.x) / 2, start.y);
      const handle2 = new paper.Point((start.x + end.x) / 2, end.y);

      connection.segments[0].point = start;
      connection.segments[1].handleOut = handle1.subtract(start);
      connection.segments[2].handleIn = handle2.subtract(end);
      connection.segments[2].point = end;
    });
    paper.view.draw();
  };

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', position: 'fixed', top: 0, left: 0 }}>
      <canvas
        ref={canvasRef}
        id="myCanvas"
        resize="true"
        style={{ width: '100vw', height: '100vh', display: 'block' }}
      />
      <button
        onClick={addBox}
        style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}
      >
        Add Box
      </button>
      <button
        onClick={removeBox}
        style={{ position: 'absolute', top: 10, left: 100, zIndex: 10 }}
      >
        Remove Box
      </button>
    </div>
  );
};

export default PaperCanvas;