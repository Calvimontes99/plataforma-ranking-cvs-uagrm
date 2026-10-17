<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('ranking:publish-outbox')->everySecond()->withoutOverlapping();
