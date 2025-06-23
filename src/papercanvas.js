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
      paper.view.viewSize = new paper.Size(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
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
    const newBox = new paper.Path.Rectangle({
      point: [Math.random() * paper.view.size.width, Math.random() * paper.view.size.height],
      size: [50, 50],
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
    <div>
      <canvas ref={canvasRef} id="myCanvas" resize="true" style={{ width: '100%', height: '400px' }} />
      <button onClick={addBox}>Add Box</button>
      <button onClick={removeBox}>Remove Box</button>
    </div>
  );
};

export default PaperCanvas;