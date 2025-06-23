import React, { useEffect, useRef, useState } from 'react';
import paper from 'paper';
import JSONInput from 'react-json-editor-ajrm';
import locale from 'react-json-editor-ajrm/locale/en';
import SplitPane from 'react-split-pane';

const PaperCanvas = () => {
  const canvasRef = useRef(null);
  const resizeCanvasRef = useRef(null);
  const [boxes, setBoxes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [jsonData, setJsonData] = useState({
    boxes: [],
    connections: []
  });

  const paperState = useRef({
    boxes: [],
    connections: [],
    lastWidth: null,
    lastHeight: null,
  });
  paperState.current.boxes = boxes;
  paperState.current.connections = connections;

  useEffect(() => {
    if (!canvasRef.current) {
      console.error('Canvas ref is null');
      return;
    }

    paper.setup(canvasRef.current);

    const drawAxes = () => {
      // Remove old axes if they exist to prevent duplicates on resize
      paper.project.getItems({ name: 'axis' }).forEach(item => item.remove());

      const origin = new paper.Point(50, paper.view.size.height - 50);
      const viewSize = paper.view.size;

      // X-axis
      const xAxis = new paper.Path.Line(new paper.Point(0, origin.y), new paper.Point(viewSize.width, origin.y));
      xAxis.strokeColor = 'grey';
      xAxis.name = 'axis';

      // Y-axis
      const yAxis = new paper.Path.Line(new paper.Point(origin.x, 0), new paper.Point(origin.x, viewSize.height));
      yAxis.strokeColor = 'grey';
      yAxis.name = 'axis';

      // Origin text
      const originText = new paper.PointText(origin.add(5, -10));
      originText.content = `(0,0)`;
      originText.fillColor = 'black';
      originText.fontSize = 12;
      originText.name = 'axis';

      // X-axis label
      const xLabel = new paper.PointText(new paper.Point(viewSize.width - 20, origin.y - 10));
      xLabel.content = 'x';
      xLabel.fillColor = 'grey';
      xLabel.name = 'axis';

      // Y-axis label
      const yLabel = new paper.PointText(new paper.Point(origin.x + 10, 20));
      yLabel.content = 'y';
      yLabel.fillColor = 'grey';
      yLabel.name = 'axis';
    };

    const updateConnectionsForResize = () => {
      paperState.current.connections.forEach((connection, index) => {
        if (index + 1 >= paperState.current.boxes.length) {
          return;
        }
        const box1 = paperState.current.boxes[index];
        const box2 = paperState.current.boxes[index + 1];
        const start = box1.bounds.center;
        const end = box2.bounds.center;
        const handle1 = new paper.Point((start.x + end.x) / 2, start.y);
        const handle2 = new paper.Point((start.x + end.x) / 2, end.y);

        if (connection.segments.length === 2) {
          connection.segments[0].point = start;
          connection.segments[1].point = end;
          connection.segments[0].handleOut = handle1.subtract(start);
          connection.segments[1].handleIn = handle2.subtract(end);
        }
      });
    };

    const resizeCanvas = () => {
      if (!canvasRef.current || !canvasRef.current.parentElement) return;

      const canvasContainer = canvasRef.current.parentElement;
      const newWidth = canvasContainer.clientWidth;
      const newHeight = canvasContainer.clientHeight;

      const oldHeight = paperState.current.lastHeight;

      // Handle height changes - move boxes to maintain relative position from bottom
      if (oldHeight !== null) {
        const deltaY = newHeight - oldHeight;
        if (deltaY !== 0) {
          paperState.current.boxes.forEach(box => {
            box.position.y += deltaY;
          });
        }
      }

      // Store new dimensions
      paperState.current.lastWidth = newWidth;
      paperState.current.lastHeight = newHeight;

      // Update canvas dimensions
      canvasRef.current.width = newWidth;
      canvasRef.current.height = newHeight;
      
      // Update Paper.js view size without scaling content
      paper.view.setViewSize(new paper.Size(newWidth, newHeight));
      
      // Ensure pixel ratio is maintained
      const pixelRatio = window.devicePixelRatio || 1;
      canvasRef.current.style.width = newWidth + 'px';
      canvasRef.current.style.height = newHeight + 'px';
      canvasRef.current.width = newWidth * pixelRatio;
      canvasRef.current.height = newHeight * pixelRatio;
      paper.view.setViewSize(new paper.Size(newWidth, newHeight));
      
      const ctx = canvasRef.current.getContext('2d');
      ctx.scale(pixelRatio, pixelRatio);
      
      updateConnectionsForResize();
      drawAxes();
      paper.view.draw();
    };
    resizeCanvasRef.current = resizeCanvas;

    if (paperState.current.lastWidth === null) {
      paperState.current.lastWidth = window.innerWidth * 0.75; // Initial 75% width
    }
    if (paperState.current.lastHeight === null) {
      paperState.current.lastHeight = window.innerHeight;
    }

    resizeCanvas();
    
    // Use setTimeout to ensure canvas is fully initialized before drawing axes
    setTimeout(() => {
      drawAxes();
      paper.view.draw();
    }, 0);
    
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
    const viewWidth = paper.view.size.width;
    const viewHeight = paper.view.size.height;
    const x = Math.random() * (viewWidth - boxWidth);
    const y = Math.random() * (viewHeight - boxHeight);
    setCoords({ x: Math.round(x), y: Math.round(y) });

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
        const boxIndex = paperState.current.boxes.findIndex(b => b === newBox);
        updateConnectionsOnDrag(newBox, boxIndex);
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
      
      // Update JSON data
      const boxesData = newBoxes.map((box, index) => ({
        id: index,
        position: {
          x: Math.round(box.position.x),
          y: Math.round(box.position.y)
        }
      }));
      setJsonData(prev => ({ ...prev, boxes: boxesData }));
      
      return newBoxes;
    });

    paper.view.draw();
  };

  const removeBox = () => {
    console.log('Removing box');
    if (paperState.current.boxes.length > 0) {
      const lastBox = paperState.current.boxes.pop();
      lastBox.remove();
      const newBoxes = [...paperState.current.boxes];
      setBoxes(newBoxes);
      updateConnectionsAfterBoxChange(newBoxes);
      paper.view.draw();
    }
  };

  const createConnection = (box1, box2) => {
    console.log('Creating connection');
    const start = box1.bounds.center;
    const end = box2.bounds.center;
    const handle1 = new paper.Point((start.x + end.x) / 2, start.y);
    const handle2 = new paper.Point((start.x + end.x) / 2, end.y);

    const path = new paper.Path({
        segments: [new paper.Segment(start), new paper.Segment(end)],
        strokeColor: 'black',
        strokeWidth: 2
    });

    path.segments[0].handleOut = handle1.subtract(start);
    path.segments[1].handleIn = handle2.subtract(end);

    return path;
  };

  const updateConnectionsAfterBoxChange = (newBoxes) => {
    console.log('Updating connections after box change');
    paperState.current.connections.forEach(conn => conn.remove());
    const newConnections = [];
    const connectionsData = [];
    
    for (let i = 0; i < newBoxes.length - 1; i++) {
      const connection = createConnection(newBoxes[i], newBoxes[i + 1]);
      newConnections.push(connection);
      
      // Add connection data for JSON
      connectionsData.push({
        from: i,
        to: i + 1,
        points: {
          start: {
            x: Math.round(newBoxes[i].bounds.center.x),
            y: Math.round(newBoxes[i].bounds.center.y)
          },
          end: {
            x: Math.round(newBoxes[i + 1].bounds.center.x),
            y: Math.round(newBoxes[i + 1].bounds.center.y)
          }
        }
      });
    }
    
    setConnections(newConnections);
    paperState.current.connections = newConnections;
    setJsonData(prev => ({ ...prev, connections: connectionsData }));
    console.log('New connections:', newConnections.length);
  };

  const updateConnectionsOnDrag = (draggedBox, boxIndex) => {
    // Update JSON data for the dragged box
    setJsonData(prev => {
      const newBoxes = [...prev.boxes];
      newBoxes[boxIndex] = {
        ...newBoxes[boxIndex],
        position: {
          x: Math.round(draggedBox.position.x),
          y: Math.round(draggedBox.position.y)
        }
      };
      return { ...prev, boxes: newBoxes };
    });

    if (boxIndex > 0) {
      const prevConnection = paperState.current.connections[boxIndex - 1];
      if (prevConnection) {
        const prevBox = paperState.current.boxes[boxIndex - 1];
        const start = prevBox.bounds.center;
        const end = draggedBox.bounds.center;
        const handle1 = new paper.Point((start.x + end.x) / 2, start.y);
        const handle2 = new paper.Point((start.x + end.x) / 2, end.y);
        prevConnection.segments[0].point = start;
        prevConnection.segments[1].point = end;
        prevConnection.segments[0].handleOut = handle1.subtract(start);
        prevConnection.segments[1].handleIn = handle2.subtract(end);
      }
    }
    if (boxIndex < paperState.current.boxes.length - 1) {
      const nextConnection = paperState.current.connections[boxIndex];
      if (nextConnection) {
        const nextBox = paperState.current.boxes[boxIndex + 1];
        const start = draggedBox.bounds.center;
        const end = nextBox.bounds.center;
        const handle1 = new paper.Point((start.x + end.x) / 2, start.y);
        const handle2 = new paper.Point((start.x + end.x) / 2, end.y);
        nextConnection.segments[0].point = start;
        nextConnection.segments[1].point = end;
        nextConnection.segments[0].handleOut = handle1.subtract(start);
        nextConnection.segments[1].handleIn = handle2.subtract(end);
      }
    }
    paper.view.draw();
  };

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', position: 'fixed', top: 0, left: 0 }}>
      <SplitPane split="vertical" defaultSize="75%" resizerStyle={{backgroundColor: '#ccc', width: '5px'}} onPaneResized={() => resizeCanvasRef.current && resizeCanvasRef.current()}>
        <div style={{ position: 'relative', height: '100%' }}>
          <canvas
            ref={canvasRef}
            id="myCanvas"
            resize="true"
            style={{ display: 'block', width: '100%', height: '100%' }}
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
          <div style={{ position: 'absolute', top: 10, left: 200, zIndex: 10, backgroundColor: 'white', padding: '5px' }}>
            x: {coords.x}, y: {coords.y}
          </div>
        </div>
        <div style={{ height: '100%', borderLeft: '1px solid #ccc', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <JSONInput
            id='json-editor'
            placeholder={jsonData}
            locale={locale}
            height='100vh'
            width='100%'
            onChange={(data) => setJsonData(data.jsObject)}
            style={{ flex: 1 }}
          />
        </div>
      </SplitPane>
    </div>
  );
};

export default PaperCanvas;