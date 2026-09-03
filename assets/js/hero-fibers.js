/* МРТ ПЛЮС – волокна трактографії в першому екрані.
   Це змодельована ілюстрація методу, не медичне зображення.
   Три пучки волокон у 3D повільно обертаються навколо вертикальної осі.
   Колір волокна залежить від його напрямку, як у справжній DTI-карті:
   вертикальний хід – синій, поперечний – червоний, поздовжній – зелений. */
(function () {
  "use strict";

  var canvas = document.querySelector("[data-hero-fibers]");
  if (!canvas) return;

  var wide = window.matchMedia("(min-width: 64em)");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  var started = false;

  /* Детермінований шум: сума синусів з різними частотами. */
  function wobble(seed, t) {
    return (
      Math.sin(t * 1.7 + seed * 12.9) * 0.55 +
      Math.sin(t * 3.1 + seed * 78.2) * 0.3 +
      Math.sin(t * 5.3 + seed * 37.7) * 0.15
    );
  }

  /* Волокно: точки вздовж скелета зі зсувом і шумом.
     Скелет задається функцією spine(u) -> [x, y, z], u в 0..1. */
  function makeFiber(spine, seed, spread) {
    var pts = [];
    var offA = (Math.sin(seed * 91.7) + 1) * Math.PI;
    var offR = Math.abs(Math.sin(seed * 53.1)) * spread;
    var steps = 36;
    for (var s = 0; s <= steps; s++) {
      var u = s / steps;
      var base = spine(u);
      var swell = 0.3 + 0.7 * Math.sin(u * Math.PI);
      pts.push([
        base[0] + Math.cos(offA) * offR * swell + wobble(seed, u * 4) * 9,
        base[1] + wobble(seed + 5, u * 4) * 7,
        base[2] + Math.sin(offA) * offR * swell + wobble(seed + 9, u * 4) * 9
      ]);
    }
    return pts;
  }

  /* Колір за напрямком кінців волокна: |dx| -> червоний, |dy| -> синій,
     |dz| -> зелений. Так фарбує справжня DTI-карта (з точністю до осей). */
  function fiberColor(pts) {
    var a = pts[4];
    var b = pts[pts.length - 5];
    var dx = Math.abs(b[0] - a[0]);
    var dy = Math.abs(b[1] - a[1]);
    var dz = Math.abs(b[2] - a[2]);
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var r = Math.round(70 + 185 * (dx / len));
    var g = Math.round(70 + 185 * (dz / len));
    var bl = Math.round(90 + 165 * (dy / len));
    return [r, g, bl];
  }

  /* Три пучки, як у сцені на станції, але з асиметрією живої
     анатомії: стовбур з віялом угору-вправо, гребінь поперечних
     дуг і поздовжній пучок у глибину нижнім планом. */
  function buildScene() {
    var fibers = [];
    var i, seed;

    /* Стовбур з віялом. Низ зібраний, але не в голку; віяло
       розкривається переважно вгору і вправо. */
    for (i = 0; i < 120; i++) {
      seed = i * 0.613 + 0.07;
      (function (seed) {
        var fanA = -0.6 + ((seed * 197) % 1) * 3.6;
        var fanR = 50 + ((seed * 883) % 130);
        var lean = 26 + ((seed * 311) % 30);
        var rootX = -45 + ((seed * 641) % 44) - 22;
        var rootZ = ((seed * 449) % 36) - 18;
        fibers.push({
          pts: makeFiber(function (u) {
            var open = Math.max(0, u - 0.4) / 0.6;
            var bend = open * open;
            return [
              rootX + Math.sin(u * 2.4) * lean + Math.cos(fanA) * fanR * bend,
              170 - u * 320,
              rootZ + Math.sin(fanA) * fanR * bend * 0.8
            ];
          }, seed, 14 + ((seed * 57) % 18))
        });
      })(seed);
    }

    /* Гребінь поперечних дуг: різні радіуси, глибини й прогини. */
    for (i = 0; i < 62; i++) {
      seed = i * 0.377 + 11.3;
      (function (seed) {
        var arcR = 130 + ((seed * 421) % 110);
        var lift = 102 + ((seed * 733) % 82);
        var zoff = -70 + ((seed * 269) % 120);
        fibers.push({
          pts: makeFiber(function (u) {
            return [
              (-arcR + u * arcR * 2) * 1.15,
              -55 - Math.sin(u * Math.PI) * lift - zoff * 0.2,
              zoff + Math.sin(u * Math.PI * 2 + seed) * 12
            ];
          }, seed, 9 + ((seed * 91) % 10))
        });
      })(seed);
    }

    /* Поздовжній пучок: комета в глибину нижнім планом. */
    for (i = 0; i < 42; i++) {
      seed = i * 0.531 + 29.7;
      (function (seed) {
        var rise = ((seed * 173) % 70);
        fibers.push({
          pts: makeFiber(function (u) {
            return [
              -195 + u * 320 + Math.sin(u * 3 + seed) * 16,
              108 - rise * 0.6 + Math.sin(u * Math.PI) * 18,
              -170 + u * 380
            ];
          }, seed, 9 + ((seed * 47) % 10))
        });
      })(seed);
    }

    for (i = 0; i < fibers.length; i++) {
      fibers[i].rgb = fiberColor(fibers[i].pts);
    }
    return fibers;
  }

  var fibers = null;
  var ctx = null;
  var W = 0;
  var H = 0;
  var raf = 0;

  function resize() {
    var box = canvas.parentElement.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(box.width));
    H = Math.max(1, Math.round(box.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(t) {
    var angle = t * 0.00022;
    var breathe = Math.sin(t * 0.0005) * 0.05;
    var cosA = Math.cos(angle);
    var sinA = Math.sin(angle);
    var scale = (Math.min(W, H) / 480) * (1 + breathe);
    var cx = W / 2;
    var cy = H / 2 + 10;
    var persp = 620;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    var f, pts, rgb, p, x, z, rx, rz, k, px, py, first, depth;
    for (var i = 0; i < fibers.length; i++) {
      f = fibers[i];
      pts = f.pts;
      rgb = f.rgb;
      depth = 0;
      ctx.beginPath();
      first = true;
      for (var s = 0; s < pts.length; s++) {
        p = pts[s];
        x = p[0];
        z = p[2];
        rx = x * cosA - z * sinA;
        rz = x * sinA + z * cosA;
        k = persp / (persp + rz * scale);
        px = cx + rx * scale * k;
        py = cy + (p[1] + rx * 0.12) * scale * k;
        depth += rz;
        if (first) {
          ctx.moveTo(px, py);
          first = false;
        } else {
          ctx.lineTo(px, py);
        }
      }
      depth = depth / pts.length;
      /* Ближчі волокна яскравіші й товщі: дешева глибина. */
      var near = Math.max(0.22, Math.min(1, 1 - depth / 520));
      ctx.strokeStyle =
        "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.08 * near).toFixed(3) + ")";
      ctx.lineWidth = 2.1 * near;
      ctx.stroke();
      ctx.strokeStyle =
        "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.27 * near).toFixed(3) + ")";
      ctx.lineWidth = 0.7 * near;
      ctx.stroke();
    }
  }

  function tick(t) {
    draw(t);
    raf = window.requestAnimationFrame(tick);
  }

  function start() {
    if (started || !wide.matches) return;
    started = true;
    fibers = buildScene();
    resize();
    if (still.matches) {
      draw(41000); /* один нерухомий кадр під виразним кутом */
    } else {
      raf = window.requestAnimationFrame(tick);
    }
  }

  window.addEventListener("resize", function () {
    if (!started) return;
    resize();
    if (still.matches) draw(41000);
  });

  start();
  wide.addEventListener("change", start);
})();
